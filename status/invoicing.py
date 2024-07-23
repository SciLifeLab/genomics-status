import json
import datetime
import markdown
import os
import logging
import pandas as pd
import requests
from dateutil.relativedelta import relativedelta

import tornado.web
from weasyprint import HTML, CSS

from status.util import SafeHandler
from status.pricing import AgreementsDBHandler

logging.getLogger("fontTools").setLevel(logging.ERROR)
logging.getLogger("weasyprint").setLevel(logging.ERROR)


class InvoicingDataHandler(SafeHandler):
    """Base class that other handlers can inherit from for methods to access invoicing data.

    Implements logic that other classes can reuse
    """

    # _____________________________ FETCH METHODS _____________________________

    def get_proj_doc(self, proj_id: str) -> dict:
        view = self.application.projects_db.view(
            "project/project_id", startkey=proj_id, limit=1
        )
        proj_doc_id = view.rows[0].value
        proj_doc = self.application.projects_db.get(proj_doc_id)

        return proj_doc

    def get_order_details(self, order_id: str) -> dict:
        order_url = (
            f'{self.application.order_portal_conf["api_get_order_url"]}/{order_id}'
        )
        headers = {
            "X-OrderPortal-API-key": self.application.order_portal_conf["api_token"]
        }
        response = requests.get(order_url, headers=headers)
        assert response.status_code == 200, (response.status_code, response.reason)

        return response.json()["fields"]


class InvoicingPageHandler(SafeHandler):
    """Serves the invoicing page

    Loaded through:
        /invoicing

    """

    def get(self):
        t = self.application.loader.load("invoicing.html")
        self.write(
            t.generate(
                gs_globals=self.application.gs_globals, user=self.get_current_user()
            )
        )


class InvoicingPageDataHandler(AgreementsDBHandler):
    """Returns the list of projects that are ready to have their invoice specifications sent

    Loaded through:
        /api/v1/invoice_spec_list

    """

    def get(self):
        view = self.application.projects_db.view("invoicing/spec_generated_not_sent")

        proj_list = {}

        for row in view:
            proj_list[row.key] = row.value
            agreement_data = self.fetch_agreement(row.key)
            total_cost = agreement_data["saved_agreements"][
                agreement_data["invoice_spec_generated_for"]
            ]["total_cost"]
            proj_list[row.key]["total_cost"] = total_cost
        self.write(proj_list)


class InvoiceSpecDateHandler(AgreementsDBHandler, InvoicingDataHandler):
    """Saves the date of Invoice Specification generation

    Loaded through:
        /api/v1/generate_invoice_spec
    """

    def post(self):
        if not self.get_current_user().is_proj_coord:
            self.set_status(401)
            return self.write(
                "Error: You do not have the permissions for this operation!"
            )

        post_data = tornado.escape.json_decode(self.request.body)
        action_type = post_data["action_type"]

        proj_doc = self.get_proj_doc(post_data["proj_id"])

        if action_type == "generate":
            agreement_doc = self.fetch_agreement(post_data["proj_id"])
            agreement_for_invoice_timestamp = post_data["timestamp"]
            if agreement_for_invoice_timestamp not in agreement_doc["saved_agreements"]:
                self.set_status(400)
                return self.write("Error: Chosen agreement not found")

            agreement_doc["invoice_spec_generated_for"] = agreement_for_invoice_timestamp
            agreement_doc["invoice_spec_generated_by"] = self.get_current_user().name
            generated_at = int(datetime.datetime.now().timestamp() * 1000)
            agreement_doc["invoice_spec_generated_at"] = generated_at
            proj_doc["agreement_doc_id"] = agreement_doc["_id"]
            return_msg = "Invoice spec generated"
            # # probably add a try-except here in the future
            self.application.agreements_db.save(agreement_doc)
        
        if action_type == "invalidate":
            generated_at =  post_data["timestamp"]
            return_msg = "Invoice spec invalidated"

        proj_doc["invoice_spec_generated"] = generated_at
        self.application.projects_db.save(proj_doc)
        # update proj db directly at same time as lims? Do we need it in lims?

        self.set_header("Content-type", "application/json")
        self.write({"message": return_msg})


class GenerateInvoiceHandler(AgreementsDBHandler, InvoicingDataHandler):
    """Generate the actual invoice document

    Loaded through:
        /api/v1/generate_invoice
    """

    def get(self):
        if len(self.request.arguments["project"]) == 1:
            proj_id = self.request.arguments["project"][0].decode("utf-8")
            agreement_doc = self.fetch_agreement(proj_id)
            invoice_defaults = self.fetch_agreement("invoice_defaults")
            account_dets, contact_dets, proj_specs = self.get_invoice_data(
                proj_id, agreement_doc, invoice_defaults
            )

            htmlgen, _ = self.generate_invoice_html_pdf(
                account_dets, contact_dets, proj_specs
            )
            self.write(htmlgen)
        else:
            self.set_status(400)
            return self.write("Error: Multiple projects specified!")

    def post(self):
        from io import BytesIO
        import zipfile as zp

        if not self.get_current_user().is_proj_coord:
            self.set_status(401)
            return self.write(
                "Error: You do not have the permissions for this operation!"
            )

        args = self.request.arguments["projects"][0].decode("utf-8")
        if not args:
            self.set_status(400)
            return self.write("Error: No projects specified!")
        projects = args.split(",")

        fileName = f"invoices_{datetime.datetime.now().date()}.zip"
        buff = BytesIO()
        excel_buff = BytesIO()
        col_headers = [
            "Belopp",
            "Kundnr",
            "Artikeltext",
            "Antal",
            "Extra text1, max 60 tkn",
            "Extra text2, max 60 tkn",
            "Extra text3, max 60 tkn",
            "Extra text4, max 60 tkn",
            "Extra text5, max 60 tkn",
            "Artikelnr",
            "Batch_id",
            "Ftg",
            "Org",
            "Proj",
            "Fin/MP",
            "Ver.text",
            "Beställare, max 25 tkn",
            "Attansv/Säljare",
            "Stängt Datum",
        ]
        invoice_defaults = self.fetch_agreement("invoice_defaults")
        data = []
        with zp.ZipFile(buff, "w") as zf:
            for proj_id in projects:
                agreement_doc = self.fetch_agreement(proj_id)
                account_dets, contact_dets, proj_specs = self.get_invoice_data(
                    proj_id, agreement_doc, invoice_defaults
                )

                _, pdfgen = self.generate_invoice_html_pdf(
                    account_dets, contact_dets, proj_specs
                )
                zf.writestr(f"{proj_id}_invoice_specification.pdf", pdfgen)

                row = [
                    proj_specs["total_cost"],
                    " ",
                    f'{proj_specs["id"]}, {proj_specs["name"]}',
                    "1,00",
                    f'({proj_specs["cust_desc"]})',
                    account_dets["fakturaunderlag"],
                    account_dets["fakturafragor"],
                    account_dets["support_email"],
                    " ",
                    account_dets["artikelnr"],
                    " ",
                    account_dets["ftg"],
                    account_dets["unit"],
                    account_dets["number"],
                    " ",
                    f'{proj_specs["id"]}, {proj_specs["name"]}',
                    contact_dets["reference"],
                    account_dets["ansvarig"],
                    proj_specs["close_date"],
                ]
                data.append(row)

                proj_doc = self.get_proj_doc(proj_id)
                proj_doc["invoice_spec_downloaded"] = int(
                    datetime.datetime.now().timestamp() * 1000
                )
                self.application.projects_db.save(proj_doc)
            df = pd.DataFrame(data, columns=col_headers)
            df.to_excel(excel_buff, index=False)
            excel_buff.seek(0)
            zf.writestr(
                f"invoices_{datetime.datetime.now().date()}.xlsx", excel_buff.getvalue()
            )

        self.set_header("Content-Type", "application/zip")
        self.set_header(
            "Content-Disposition", "attachment; filename={}".format(fileName)
        )
        self.write(buff.getvalue())
        buff.close()
        self.finish()

    def get_invoice_data(
        self, proj_id: str, agreement_doc: dict, inv_defs: dict
    ) -> tuple[dict, dict, dict]:
        """Retrieve invoice data"""

        proj_doc = self.get_proj_doc(proj_id)

        invoiced_agreement = agreement_doc["saved_agreements"][
            agreement_doc["invoice_spec_generated_for"]
        ]

        account_dets = {}
        account_dets["number"] = inv_defs["account_details"]["accounts"]["default"]
        if invoiced_agreement["price_type"] == "full_cost":
            account_dets["number"] = inv_defs["account_details"]["accounts"][
                "full_cost"
            ]
        account_dets["unit"] = inv_defs["account_details"]["unit"]
        account_dets["contact"] = inv_defs["account_details"]["contact"]
        account_dets["ansvarig"] = inv_defs["account_details"]["ansvarig"]
        account_dets["fakturaunderlag"] = inv_defs["account_details"]["fakturaunderlag"]
        account_dets["fakturafragor"] = inv_defs["account_details"]["fakturafragor"]
        account_dets["support_email"] = inv_defs["account_details"]["support_email"]
        account_dets["artikelnr"] = inv_defs["account_details"].get("artikelnr", "")
        account_dets["ftg"] = inv_defs["account_details"].get("ftg", "")

        contact_dets = {}
        fields = self.get_order_details(proj_doc["order_details"]["identifier"])
        contact_dets["name"] = fields["project_pi_name"]
        contact_dets["email"] = fields["project_pi_email"]
        contact_dets["reference"] = fields["project_invoice_ref"]
        contact_dets["invoice_address"] = fields["address_invoice_address"]
        contact_dets["invoice_zip"] = fields["address_invoice_zip"]
        contact_dets["invoice_city"] = fields["address_invoice_city"]
        contact_dets["invoice_country"] = fields["address_invoice_country"]
        contact_dets["department"] = (
            fields["address_postal_department"]
            if "address_postal_department" in fields
            and fields["address_postal_department"]
            else "-"
        )
        contact_dets["university"] = (
            fields["address_postal_university"]
            if "address_postal_university" in fields
            and fields["address_postal_university"]
            else "-"
        )
        contact_dets["invoice_vat"] = (
            fields["invoice_vat"]
            if "invoice_vat" in fields and fields["invoice_vat"]
            else "-"
        )
        contact_dets["invoice_organisation_number"] = (
            fields["invoice_organisation_number"]
            if "invoice_organisation_number" in fields
            and fields["invoice_organisation_number"]
            else "-"
        )

        proj_specs = {}

        proj_specs["id"] = proj_id
        proj_specs["name"] = proj_doc["project_name"]
        proj_specs["cust_desc"] = proj_doc["details"].get(
            "customer_project_reference", ""
        )
        proj_specs["invoice_created"] = datetime.datetime.fromtimestamp(
            agreement_doc["invoice_spec_generated_at"] / 1000.0
        ).strftime("%Y-%m-%d")
        proj_specs[
            "contract_name"
        ] = f'{proj_id}_{agreement_doc["invoice_spec_generated_for"]}'
        proj_specs["summary"] = markdown.markdown(
            invoiced_agreement["agreement_summary"], extensions=["sane_lists"]
        )
        # TODO: Comment will be added in the future
        # proj_specs['comment'] = "Finished according to contract" #Customise?
        proj_specs["price_breakup"] = invoiced_agreement["price_breakup"]
        if "special_addition" in invoiced_agreement:
            proj_specs["special_addition"] = invoiced_agreement["special_addition"]
        if "special_percentage" in invoiced_agreement:
            proj_specs["special_percentage"] = invoiced_agreement["special_percentage"]
        proj_specs["total_cost"] = invoiced_agreement["total_cost"]
        proj_specs["total_cost_discount"] = invoiced_agreement["total_cost_discount"]
        proj_specs["close_date"] = proj_doc.get("close_date", "-")
        proj_specs["invoice_created_by"] = agreement_doc["invoice_spec_generated_by"]

        return account_dets, contact_dets, proj_specs

    def generate_invoice_html_pdf(
        self, account_dets: dict, contact_dets: dict, proj_specs: dict
    ) -> tuple[str, bytes]:
        """Generate invoice html"""

        invoice_template = self.application.loader.load("invoice_template.html")
        invoice_gen = invoice_template.generate(
            gs_globals=self.application.gs_globals,
            user=self.get_current_user(),
            account_dets=account_dets,
            contact_dets=contact_dets,
            proj_specs=proj_specs,
        )

        css = CSS(string="body { font-family: Noto Serif!important; }")
        html = HTML(string=invoice_gen.decode("utf-8"), base_url=os.getcwd())
        pdfgen = html.write_pdf(stylesheets=[css])
        return invoice_gen.decode("utf-8"), pdfgen


class DeleteInvoiceHandler(AgreementsDBHandler, InvoicingDataHandler):
    """Delete generated invoice specs

    Loaded through:
        /api/v1/delete_invoice
    """

    def delete(self):
        projs = json.loads(self.request.body)["projects"]
        for proj_id in projs:
            proj_doc = self.get_proj_doc(proj_id)
            proj_doc.pop("invoice_spec_generated")

            agreement_doc = self.fetch_agreement(proj_id)
            agreement_doc.pop("invoice_spec_generated_for")
            agreement_doc.pop("invoice_spec_generated_by")
            agreement_doc.pop("invoice_spec_generated_at")

            self.application.agreements_db.save(agreement_doc)
            self.application.projects_db.save(proj_doc)


class SentInvoiceHandler(AgreementsDBHandler):
    """Get invoices downloaded in the last 6 months

    Loaded through:
        /api/v1/get_sent_invoices
    """

    def get(self):
        # Show all sent invoices for now.
        # six_months_ago = (datetime.datetime.now() - relativedelta(months=6)).strftime(
        #    "%Y-%m-%d"
        # )
        view = self.application.projects_db.view(
            "invoicing/spec_sent",  # startkey=six_months_ago
        )
        proj_list = {}
        for row in view:
            proj_list[row.value] = {"downloaded_date": row.key}
            agreement_data = self.fetch_agreement(row.value)
            total_cost = agreement_data["saved_agreements"][
                agreement_data["invoice_spec_generated_for"]
            ]["total_cost"]
            proj_list[row.value]["total_cost"] = total_cost
        self.write(proj_list)


class InvoicingOrderDetailsHandler(AgreementsDBHandler, InvoicingDataHandler):
    """Get order details needed for invoicing

    Loaded through:
        /api/v1/get_order_det_invoicing/([^/]*)
    """

    def get(self, order_id):
        order_details = self.get_order_details(order_id)
        contact_dets = {}
        contact_dets["reference"] = order_details["project_invoice_ref"]
        contact_dets["invoice_address"] = order_details["address_invoice_address"]
        contact_dets["invoice_zip"] = order_details["address_invoice_zip"]
        contact_dets["invoice_city"] = order_details["address_invoice_city"]
        contact_dets["invoice_country"] = order_details["address_invoice_country"]
        contact_dets["department"] = (
            order_details["address_invoice_department"]
            if "address_invoice_department" in order_details
            and order_details["address_invoice_department"]
            else "-"
        )
        contact_dets["university"] = (
            order_details["address_invoice_university"]
            if "address_invoice_university" in order_details
            and order_details["address_invoice_university"]
            else "-"
        )
        contact_dets["invoice_vat"] = (
            order_details["invoice_vat"]
            if "invoice_vat" in order_details and order_details["invoice_vat"]
            else "-"
        )
        contact_dets["invoice_organisation_number"] = (
            order_details["invoice_organisation_number"]
            if "invoice_organisation_number" in order_details
            and order_details["invoice_organisation_number"]
            else "-"
        )
        self.set_header("Content-type", "application/json")
        self.write(contact_dets)
