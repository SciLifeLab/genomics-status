import json
import datetime
import markdown
import os
import logging
import pandas as pd
import requests
from dateutil.relativedelta import relativedelta

import tornado.web
import openpyxl
from weasyprint import HTML, CSS

from status.util import SafeHandler
from status.pricing import AgreementsDBHandler

logging.getLogger('fontTools').setLevel(logging.ERROR)
logging.getLogger('weasyprint').setLevel(logging.ERROR)

def get_proj_doc(app, proj_id):

    view = app.projects_db.view("project/project_id", startkey=proj_id, limit=1)
    proj_doc_id = view.rows[0].value
    proj_doc = app.projects_db.get(proj_doc_id)

    return proj_doc

class InvoicingPageHandler(SafeHandler):
    """ Serves the invoicing page

        Loaded through:
            /invoicing

    """
    def get(self):
        t = self.application.loader.load("invoicing.html")
        self.write(t.generate(gs_globals=self.application.gs_globals, user=self.get_current_user()))

class InvoicingPageDataHandler(AgreementsDBHandler):
    """ Returns the list of projects that are ready to have their invoice specifications sent

        Loaded through:
            /api/v1/invoice_spec_list

    """
    def get(self):
        view = self.application.projects_db.view("invoicing/spec_generated_not_sent")

        proj_list = {}

        for row in view:
            proj_list[row.key] = row.value
        self.write(proj_list)


class InvoiceSpecDateHandler(AgreementsDBHandler):
    """ Saves the date of Invoice Specification generation

        Loaded through:
            /api/v1/generate_invoice_spec
    """
    def post(self):
        post_data = tornado.escape.json_decode(self.request.body)

        proj_doc =  get_proj_doc(self.application, post_data['proj_id'])
        agreement_doc = self.fetch_agreement(post_data['proj_id'])

        agreement_for_invoice_timestamp = post_data['timestamp']
        if agreement_for_invoice_timestamp not in agreement_doc['saved_agreements']:
            self.set_status(400)
            return self.write("Error: Chosen agreement not found")

        agreement_doc['invoice_spec_generated_for'] = agreement_for_invoice_timestamp
        agreement_doc['invoice_spec_generated_by'] = self.get_current_user().name
        generated_at = int(datetime.datetime.now().timestamp()*1000)
        agreement_doc['invoice_spec_generated_at'] = generated_at

        proj_doc['invoice_spec_generated'] = generated_at
        proj_doc['agreement_doc_id'] = agreement_doc['_id']

        #probably add a try-except here in the future
        self.application.agreements_db.save(agreement_doc)
        self.application.projects_db.save(proj_doc)
        #update proj db directly at same time as lims? Do we need it in lims?


        self.set_header("Content-type", "application/json")
        self.write({'message': 'Invoice spec generated'})


class GenerateInvoiceHandler(AgreementsDBHandler):
    """ Generate the actual invoice document

        Loaded through:
            /generate_invoice
    """

    def get(self):
        if len(self.request.arguments['project'])==1:
            proj_id = self.request.arguments['project'][0].decode('utf-8')
            agreement_doc = self.fetch_agreement(proj_id)
            account_dets, contact_dets, proj_specs = self.get_invoice_data(proj_id, agreement_doc)

            htmlgen, _ = self.generate_invoice_html_pdf(account_dets, contact_dets, proj_specs)
            self.write(htmlgen)
        else:
            self.set_status(400)
            return self.write("Error: Multiple projects specified!")

    def post(self):
        from io import BytesIO
        import zipfile as zp

        projects = self.request.arguments['projects'][0].decode('utf-8').split(',')

        fileName = 'invoices.zip'
        buff = BytesIO()
        excel_buff = BytesIO()
        num_files = 0
        col_headers = ['Belopp', 'Kundnr', 'Artikeltext', 'Antal', 'Extra text1, max 60 tkn', 'Extra text2, max 60 tkn',
                'Extra text3, max 60 tkn', 'Extra text4, max 60 tkn', 'Extra text5, max 60 tkn', 'Artikelnr', 'Batch_id', 'Ftg',
                'Org', 'Proj', 'Fin/MP', 'Ver.text', 'Beställare, max 25 tkn', 'Attansv/Säljare']
        data = []
        with zp.ZipFile(buff, "w") as zf:
            for proj_id in projects:
                agreement_doc = self.fetch_agreement(proj_id)
                account_dets, contact_dets, proj_specs = self.get_invoice_data(proj_id, agreement_doc)

                _, pdfgen = self.generate_invoice_html_pdf(account_dets, contact_dets, proj_specs)
                zf.writestr(f'{proj_id}_invoice.pdf', pdfgen)

                row = [proj_specs['total_cost'], ' ', f'{proj_specs["id"]}, {proj_specs["name"]}', '1,00', f'({proj_specs["cust_desc"]})',
                        'Fakturaunderlag skickas till', contact_dets['email'], 'För fakturafrågor kontakta', 'support@ngisweden.se', 12345,
                        ' ', '3F', 'ABCD', 12345, ' ', f'{proj_specs["id"]}, {proj_specs["name"]}', contact_dets['reference'], 'REFR']
                data.append(row)

                proj_doc = get_proj_doc(self.application, proj_id)
                proj_doc['invoice_spec_downloaded'] = int(datetime.datetime.now().timestamp()*1000)
                self.application.projects_db.save(proj_doc)
            df = pd.DataFrame(data, columns=col_headers, index=False)
            df.to_excel(excel_buff)
            excel_buff.seek(0)
            zf.writestr('test.xlsx', excel_buff.getvalue())

        self.set_header('Content-Type', 'application/zip')
        self.set_header('Content-Disposition', 'attachment; filename={}'.format(fileName))
        self.write(buff.getvalue())
        buff.close()
        self.finish()


    def get_invoice_data(self, proj_id, agreement_doc):
        """ Retrieve invoice data"""

        proj_doc = get_proj_doc(self.application, proj_id)

        account_dets = {}
        account_dets['name'] = 'AcctName'
        account_dets['number'] = 12345
        account_dets['unit'] = 'ABCD'
        account_dets['contact'] = 'Abcde Defge'

        contact_dets = {}
        contact_dets['name'] = proj_doc['order_details']['owner']['name']
        contact_dets['email'] = proj_doc['order_details']['owner']['email']
        contact_dets['reference'] = proj_doc['details'].get('invoice_reference', '')
        #order portal invoice Address as billing address
        order_url = f'{self.application.order_portal_conf["api_get_order_url"]}/{proj_doc["order_details"]["identifier"]}'
        headers = {"X-OrderPortal-API-key": self.application.order_portal_conf["api_token"]}
        response = requests.get(order_url, headers=headers)
        assert response.status_code == 200, (response.status_code, response.reason)
        fields = response.json()['fields']
        contact_dets['invoice_address'] = fields['address_invoice_address']
        contact_dets['invoice_zip'] = fields['address_invoice_zip']
        contact_dets['invoice_city'] = fields['address_invoice_city']
        contact_dets['invoice_country'] = fields['address_invoice_country']

        proj_specs = {}

        proj_specs['id'] = proj_id
        proj_specs['name'] = proj_doc["project_name"]
        proj_specs['cust_desc'] = proj_doc["details"].get("customer_project_reference", "")
        proj_specs['invoice_created'] = datetime.datetime.fromtimestamp(agreement_doc['invoice_spec_generated_at']/1000.0).strftime("%Y-%m-%d")
        proj_specs['contract_name'] =f'{proj_id}_{agreement_doc["invoice_spec_generated_for"]}'
        invoiced_agreement = agreement_doc['saved_agreements'][agreement_doc['invoice_spec_generated_for']]
        proj_specs['summary'] = markdown.markdown(invoiced_agreement['agreement_summary'], extensions=['sane_lists'])
        proj_specs['comment'] = "Finished according to contract" #Customise?
        try:
            proj_specs['total_cost'] = invoiced_agreement['total_cost']
        except:
            import pdb; pdb.set_trace()

        return account_dets, contact_dets, proj_specs


    def generate_invoice_html_pdf(self, account_dets, contact_dets, proj_specs):
        """ Generate invoice html """

        invoice_template = self.application.loader.load('invoice_template.html')
        invoice_gen = invoice_template.generate(gs_globals=self.application.gs_globals, user=self.get_current_user(),
                              account_dets=account_dets, contact_dets=contact_dets, proj_specs=proj_specs)

        css = CSS(string='body { font-family: inherit!important; }')
        html=HTML(string=invoice_gen.decode('utf-8'), base_url=os.getcwd())
        pdfgen = html.write_pdf(stylesheets=[css])
        with open('test.html', 'w') as file:
            file.write(invoice_gen.decode('utf-8'))
        return invoice_gen.decode('utf-8'), pdfgen

class DeleteInvoiceHandler(AgreementsDBHandler):
    """ Delete generated invoice specs

        Loaded through:
            /api/v1/delete_invoice
    """

    def delete(self):
        projs = json.loads(self.request.body)['projects']
        for proj_id in projs:
            proj_doc = get_proj_doc(self.application, proj_id)
            proj_doc.pop('invoice_spec_generated')

            agreement_doc = self.fetch_agreement(proj_id)
            agreement_doc.pop('invoice_spec_generated_for')
            agreement_doc.pop('invoice_spec_generated_by')
            agreement_doc.pop('invoice_spec_generated_at')

            self.application.agreements_db.save(agreement_doc)
            self.application.projects_db.save(proj_doc)

class SentInvoiceHandler(AgreementsDBHandler):
    """ Get invoices downloaded in the last 6 months

        Loaded through:
            /api/v1/get_sent_invoices
    """

    def get(self):

        six_months_ago = (datetime.datetime.now()- relativedelta(months=6)).strftime("%Y-%m-%d")
        view = self.application.projects_db.view("invoicing/spec_sent", startkey=six_months_ago)
        proj_list = {}
        for row in view:
            proj_list[row.key] = row.value
        self.write(proj_list)
