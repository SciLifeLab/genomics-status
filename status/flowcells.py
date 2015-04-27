"""Set of handlers related with Flowcells
"""

import tornado.web
import json
import datetime

from genologics.entities import Container
from genologics import lims
from genologics.config import BASEURI, USERNAME, PASSWORD
from collections import OrderedDict
from status.util import SafeHandler
lims = lims.Lims(BASEURI, USERNAME, PASSWORD)

class FlowcellsHandler(SafeHandler):
    """ Serves a page which lists all flowcells with some brief info.
    """
    def list_flowcells(self):
        flowcells = OrderedDict()
        fc_view = self.application.flowcells_db.view("info/summary",
                                                     descending=True)
        for row in fc_view:
            flowcells[row.key] = row.value

        return flowcells
    def get(self):
        t = self.application.loader.load("flowcells.html")
        fcs=self.list_flowcells()
        self.write(t.generate(gs_globals=self.application.gs_globals, user=self.get_current_user_name(), flowcells=fcs))


class FlowcellHandler(SafeHandler):
    """ Serves a page which shows information and QC stats for a given
    flowcell.
    """
    def get(self, flowcell):
        t = self.application.loader.load("flowcell_samples.html")
        self.write(t.generate(gs_globals=self.application.gs_globals, flowcell=flowcell, user=self.get_current_user_name()))


class FlowcellsDataHandler(SafeHandler):
    """ Serves brief information for each flowcell in the database.

    Loaded through /api/v1/flowcells url
    """
    def get(self):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.list_flowcells()))

    def list_flowcells(self):
        flowcells = OrderedDict()
        fc_view = self.application.flowcells_db.view("info/summary",
                                                     descending=True)
        for row in fc_view:
            flowcells[row.key] = row.value

        return flowcells


class FlowcellsInfoDataHandler(SafeHandler):
    """ Serves brief information about a given flowcell.

    Loaded through /api/v1/flowcell_info/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.flowcell_info(flowcell)))

    def flowcell_info(self, flowcell):
        fc_view = self.application.flowcells_db.view("info/summary2",
                                                     descending=True)
        for row in fc_view[flowcell]:
            flowcell_info = row.value
            break

        return flowcell_info

class FlowcellSearchHandler(SafeHandler):
    """ Searches Flowcells for text string

    Loaded through /api/v1/flowcell_search/([^/]*)$
    """
    def get(self, search_string):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.search_flowcell_names(search_string)))

    def search_flowcell_names(self, search_string=''):
        if len(search_string) == 0:
            return ''
        flowcells = []
        fc_view = self.application.flowcells_db.view("info/id")
        for row in fc_view:
            try:
                if search_string.lower() in row.key.lower():
                    fc = {
                        "url": '/flowcells/'+row.key,
                        "name": row.key
                    }
                    flowcells.append(fc);
            except AttributeError:
                pass
        return flowcells


class OldFlowcellsInfoDataHandler(SafeHandler):
    """ Serves brief information about a given flowcell.

    Loaded through /api/v1/flowcell_info/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.flowcell_info(flowcell)))

    def flowcell_info(self, flowcell):
        fc_view = self.application.flowcells_db.view("info/summary",
                                                     descending=True)
        for row in fc_view[flowcell]:
            flowcell_info = row.value
            break

        return flowcell_info


class FlowcellDataHandler(SafeHandler):
    """ Serves a list of sample runs in a flowcell.

    Loaded through /api/v1/flowcells/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.list_sample_runs(flowcell)))

    def list_sample_runs(self, flowcell):
        sample_run_list = []
        fc_view = self.application.samples_db.view("flowcell/name", reduce=False)
        for row in fc_view[flowcell]:
            sample_run_list.append(row.value)

        return sample_run_list


class FlowcellQCHandler(SafeHandler):
    """ Serves QC data for each lane in a given flowcell.

    Loaded through /api/v1/flowcell_qc/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.list_sample_runs(flowcell), deprecated = True))

    def list_sample_runs(self, flowcell):
        lane_qc = OrderedDict()
        lane_view = self.application.flowcells_db.view("lanes/qc")
        for row in lane_view[[flowcell, ""]:[flowcell, "Z"]]:
            lane_qc[row.key[1]] = row.value

        return lane_qc


class FlowcellDemultiplexHandler(SafeHandler):
    """ Serves demultiplex yield data for each lane in a given flowcell.

    Loaded through /api/v1/flowcell_demultiplex/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.lane_stats(flowcell), deprecated=True))

    def lane_stats(self, flowcell):
        lane_qc = OrderedDict()
        lane_view = self.application.flowcells_db.view("lanes/demultiplex")
        for row in lane_view[[flowcell, ""]:[flowcell, "Z"]]:
            lane_qc[row.key[1]] = row.value

        return lane_qc


class FlowcellQ30Handler(SafeHandler):
    """ Serves the percentage ofr reads over Q30 for each lane in the given
    flowcell.

    Loaded through /api/v1/flowcell_q30/([^/]*)$ url
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.lane_q30(flowcell), deprecated=True))

    def lane_q30(self, flowcell):
        lane_q30 = OrderedDict()
        lane_view = self.application.flowcells_db.view("lanes/gtq30", group_level=3)
        for row in lane_view[[flowcell, ""]:[flowcell, "Z"]]:
            lane_q30[row.key[2]] = row.value["sum"] / row.value["count"]

        return lane_q30

class FlowcellNotesDataHandler(SafeHandler):
    """Serves all running notes from a given flowcell.
    It connects to the genologics LIMS to fetch and update Running Notes information.
    URL: /api/v1/flowcell_notes/([^/]*)
    """
    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        try:
            p=get_container_from_id(flowcell)
        except (KeyError, IndexError) as e:
            self.write('{}')
        else:
            # Sorted running notes, by date
            running_notes = json.loads(p.udf['Notes']) if 'Notes' in p.udf else {}
            sorted_running_notes = OrderedDict()
            for k, v in sorted(running_notes.iteritems(), key=lambda t: t[0], reverse=True):
                sorted_running_notes[k] = v
            self.write(sorted_running_notes)

    def post(self, flowcell):
        note = self.get_argument('note', '')
        user = self.get_secure_cookie('user')
        email = self.get_secure_cookie('email')
        if not note:
            self.set_status(400)
            self.finish('<html><body>No note parameters found</body></html>')
        else:
            newNote = {'user': user, 'email': email, 'note': note}
            try:
                p=get_container_from_id(flowcell)
            except (KeyError, IndexError) as e:
                self.set_status(400)
                self.write('Flowcell not found')
            else:
                running_notes = json.loads(p.udf['Notes']) if 'Notes' in p.udf else {}
                running_notes[str(datetime.datetime.now())] = newNote
                p.udf['Notes'] = json.dumps(running_notes)
                p.put()
                self.set_status(201)
                self.write(json.dumps(newNote))


class FlowcellLinksDataHandler(SafeHandler):
    """ Serves external links for each project
        Links are stored as JSON in genologics LIMS / project
        URL: /api/v1/links/([^/]*)
    """

    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        try:
            p=get_container_from_id(flowcell)
        except (KeyError, IndexError) as e:
            self.write('{}')
        else:
            links = json.loads(p.udf['Links']) if 'Links' in p.udf else {}

            #Sort by descending date, then hopefully have deviations on top
            sorted_links = OrderedDict()
            for k, v in sorted(links.iteritems(), key=lambda t: t[0], reverse=True):
                sorted_links[k] = v
            sorted_links = OrderedDict(sorted(sorted_links.iteritems(), key=lambda (k,v): v['type']))
            self.write(sorted_links)

    def post(self, flowcell):
        user = self.get_secure_cookie('user')
        email = self.get_secure_cookie('email')
        a_type = self.get_argument('type', '')
        title = self.get_argument('title', '')
        url = self.get_argument('url', '')
        desc = self.get_argument('desc','')

        if not a_type or not title:
            self.set_status(400)
            self.finish('<html><body>Link title and type is required</body></html>')
        else:
            try:
                p=get_container_from_id(flowcell)
            except (KeyError, IndexError) as e:
                self.status(400)
                self.write('Flowcell not found')
            else:
                links = json.loads(p.udf['Links']) if 'Links' in p.udf else {}
                links[str(datetime.datetime.now())] = {'user': user,
                                                   'email': email,
                                                   'type': a_type,
                                                   'title': title,
                                                   'url': url,
                                                   'desc': desc}
                p.udf['Links'] = json.dumps(links)
                p.put()
                self.set_status(200)
                #ajax cries if it does not get anything back
                self.set_header("Content-type", "application/json")
                self.finish(json.dumps(links))

#Functions
def get_container_from_id(flowcell):
    if flowcell[7:].startswith('00000000'):
        #Miseq
        proc=lims.get_processes(type='MiSeq Run (MiSeq) 4.0',udf={'Flow Cell ID': flowcell[7:]})[0]
        c = lims.get_containers(name=proc.udf['Reagent Cartridge ID'])[0]
    else:    
        #Hiseq
        c = lims.get_containers(name=flowcell[8:])[0]
    return c



