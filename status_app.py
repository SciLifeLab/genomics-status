"""Main genomics-status web application."""

import base64
import csv
import logging
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import tornado.autoreload
import tornado.httpserver
import tornado.ioloop
import tornado.web
import yaml
from ibm_cloud_sdk_core.api_exception import ApiException
from ibmcloudant import CouchDbSessionAuthenticator, cloudant_v1
from tornado import template
from tornado.log import LogFormatter
from tornado.options import define, options
from zenpy import Zenpy

from status.applications import (
    ApplicationDataHandler,
    ApplicationHandler,
    ApplicationsDataHandler,
    ApplicationsHandler,
)
from status.authorization import LoginHandler, LogoutHandler, UnAuthorizedHandler
from status.barcode import BarcodeHandler
from status.bioinfo_analysis import BioinfoAnalysisHandler
from status.clone_project import CloneProjectHandler, LIMSProjectCloningHandler
from status.config_handler import ConfigDataHandler
from status.controls import ControlsHandler
from status.data_deliveries_plot import DataDeliveryHandler, DeliveryPlotHandler
from status.deliveries import DeliveriesPageHandler
from status.demux_sample_info import (
    DemuxConfigurationDetailHandler,
    DemuxConfigurationHandler,
    DemuxSampleInfoDataHandler,
    DemuxSampleInfoEditorHandler,
    SampleDeleteHandler,
)
from status.flowcell import (
    ElementFlowcellDataHandler,
    ElementFlowcellHandler,
    FlowcellHandler,
    ONTFlowcellHandler,
    ONTMinKNOWReportHandler,
    ONTToulligQCReportHandler,
)
from status.flowcells import (
    FlowcellLinksDataHandler,
    FlowcellsDataHandler,
    FlowcellSearchHandler,
    FlowcellsHandler,
    FlowcellsInfoDataHandler,
    OldFlowcellsInfoDataHandler,
    ReadTotalsDataHandler,
    ReadTotalsHandler,
)
from status.hashtag_csv import HashTagCSVHandler
from status.instruments import (
    DataInstrumentLogsHandler,
    InstrumentLogsHandler,
    InstrumentNamesHandler,
)
from status.invoicing import (
    DeleteInvoiceHandler,
    GenerateInvoiceHandler,
    InvoiceSpecDateHandler,
    InvoicingOrderDetailsHandler,
    InvoicingPageDataHandler,
    InvoicingPageHandler,
    SentInvoiceHandler,
)
from status.lanes_ordered import LanesOrderedDataHandler, LanesOrderedHandler
from status.ngisweden_stats import NGISwedenHandler
from status.ont_plot import ONTFlowcellPlotHandler, ONTFlowcellYieldHandler
from status.people_assignments import (
    PeopleAssignmentsDataHandler,
    ProjectPeopleAssignmentDataHandler,
)
from status.pricing import (
    AgreementDataHandler,
    AgreementMarkSignHandler,
    AgreementTemplateTextHandler,
    GenerateQuoteHandler,
    PricingDataHandler,
    PricingDateToVersionDataHandler,
    PricingDraftDataHandler,
    PricingExchangeRatesDataHandler,
    PricingPreviewHandler,
    PricingPublishDataHandler,
    PricingQuoteHandler,
    PricingReassignLockDataHandler,
    PricingUpdateHandler,
    PricingValidateDraftDataHandler,
    SaveQuoteHandler,
)
from status.production import (
    ProductionCronjobsHandler,
)
from status.project_cards import ProjectCardsHandler, ProjectCardsWebSocket
from status.project_creation import (
    ProjectCreationCountDetailsDataHandler,
    ProjectCreationDataHandler,
    ProjectCreationFormDataHandler,
    ProjectCreationHandler,
    ProjectCreationIndividualDataFetchHandler,
    ProjectCreationListFormsDataHandler,
    ProjectCreationListFormsHandler,
    ProjectEditingDataHandler,
    ProjectEditingHandler,
)
from status.projects import (
    CaliperImageHandler,
    CharonProjectHandler,
    FragAnImageHandler,
    ImagesDownloadHandler,
    LinksDataHandler,
    PresetsHandler,
    PresetsOnLoadHandler,
    PrioProjectsTableHandler,
    ProjectDataHandler,
    ProjectReadsSequencedHandler,
    ProjectRNAMetaDataHandler,
    ProjectSamplesDataHandler,
    ProjectSamplesHandler,
    ProjectSamplesOldHandler,
    ProjectsDataHandler,
    ProjectsFieldsDataHandler,
    ProjectsHandler,
    ProjectsSearchHandler,
    ProjectTicketsDataHandler,
    ProjMetaCompareHandler,
    RecCtrlDataHandler,
)
from status.queues import (
    LibraryPoolingQueuesDataHandler,
    LibraryPoolingQueuesHandler,
    SequencingQueuesDataHandler,
    SequencingQueuesHandler,
    SmartSeq3ProgressPageDataHandler,
    SmartSeq3ProgressPageHandler,
    WorksetQueuesDataHandler,
    WorksetQueuesHandler,
    qPCRPoolsDataHandler,
    qPCRPoolsHandler,
)
from status.reads_plot import DataFlowcellYieldHandler, FlowcellPlotHandler
from status.reports import (
    MultiQCReportHandler,
    ProjectSummaryReportHandler,
    SingleCellSampleSummaryReportHandler,
    VisiumReportHandler,
)
from status.running_notes import (
    InvoicingNotesHandler,
    LatestStickyNoteHandler,
    LatestStickyNotesMultipleHandler,
    RunningNotesDataHandler,
)
from status.sample_requirements import (
    SampleRequirementsDataHandler,
    SampleRequirementsDraftDataHandler,
    SampleRequirementsPreviewHandler,
    SampleRequirementsPublishDataHandler,
    SampleRequirementsReassignLockDataHandler,
    SampleRequirementsUpdateHandler,
    SampleRequirementsValidateDraftDataHandler,
    SampleRequirementsViewHandler,
)
from status.sensorpush import (
    SensorpushDataHandler,
    SensorpushHandler,
    SensorpushWarningsDataHandler,
)
from status.statistics import (
    ApplicationOpenProjectsHandler,
    ApplicationOpenSamplesHandler,
    StatsAggregationHandler,
    WeekInstrumentTypeYieldHandler,
    YearAffiliationProjectsHandler,
    YearApplicationsProjectHandler,
    YearApplicationsSamplesHandler,
    YearDeliverytimeApplicationHandler,
    YearDeliverytimeProjectsHandler,
)
from status.suggestion_box import SuggestionBoxDataHandler, SuggestionBoxHandler
from status.testing import TestDataHandler
from status.time_tracking import TimeTrackingDataHandler, TimeTrackingHandler
from status.user_management import (
    CurrentUserDataHandler,
    RolesAndTeamsHandler,
    UserManagementDataHandler,
    UserManagementHandler,
)
from status.user_preferences import UserPrefPageHandler, UserPrefPageHandler_b5
from status.util import (
    BaseHandler,
    DataHandler,
    LastPSULRunHandler,
    MainHandler,
)
from status.worksets import (
    ClosedWorksetsHandler,
    WorksetDataHandler,
    WorksetHandler,
    WorksetLinksHandler,
    WorksetsDataHandler,
    WorksetSearchHandler,
    WorksetsHandler,
)
from status.yield_calculator import YieldCalculatorHandler

ONT_RUN_PATTERN = r"\d{8}_\d{4}_[0-9a-zA-Z]+_[0-9a-zA-Z]+_[0-9a-zA-Z]+"


class Application(tornado.web.Application):
    def __init__(self, settings):
        # Set up a set of globals to pass to every template
        self.gs_globals = {}

        # GENOMICS STATUS MAJOR VERSION NUMBER
        # Bump this with any change that requires an update to documentation
        self.gs_globals["gs_version"] = "1.0"

        # Get the latest git commit hash
        # This acts as a minor version number for small updates
        # It also forces javascript / CSS updates and solves caching problems
        try:
            self.gs_globals["git_commit"] = subprocess.check_output(
                ["git", "rev-parse", "--short=7", "HEAD"]
            ).strip()
            self.gs_globals["git_commit_full"] = subprocess.check_output(
                ["git", "rev-parse", "HEAD"]
            ).strip()
        except:
            self.gs_globals["git_commit"] = "unknown"
            self.gs_globals["git_commit_full"] = "unknown"

        self.gs_globals["font_awesome_url"] = settings.get("font_awesome_url", None)
        self.gs_globals["prod"] = True
        if "dev" in settings.get("couch_url"):
            self.gs_globals["prod"] = False

        handlers = [
            # The tuples are on the form ("URI regex", "Backend request handler")
            # The groups of the regex are the arguments of the handlers get() method
            ("/", MainHandler),
            ("/login", LoginHandler),
            ("/logout", LogoutHandler),
            ("/unauthorized", UnAuthorizedHandler),
            ("/api/v1", DataHandler),
            ("/api/v1/applications", ApplicationsDataHandler),
            ("/api/v1/application/([^/]*)$", ApplicationDataHandler),
            ("/api/v1/bioinfo_analysis", BioinfoAnalysisHandler),
            ("/api/v1/bioinfo_analysis/([^/]*)$", BioinfoAnalysisHandler),
            tornado.web.URLSpec(
                "/api/v1/caliper_image/(?P<project>[^/]+)/(?P<sample>[^/]+)/(?P<step>[^/]+)",
                CaliperImageHandler,
                name="CaliperImageHandler",
            ),
            ("/api/v1/charon_summary/([^/]*)$", CharonProjectHandler),
            ("/api/v1/configs/([^/]*)$", ConfigDataHandler),
            ("/api/v1/cost_calculator", PricingDataHandler),
            ("/api/v1/current_user", CurrentUserDataHandler),
            ("/api/v1/delete_invoice", DeleteInvoiceHandler),
            tornado.web.URLSpec(
                "/api/v1/download_images/(?P<project>[^/]+)/(?P<type>[^/]+)",
                ImagesDownloadHandler,
                name="ImagesDownloadHandler",
            ),
            ("/api/v1/draft_cost_calculator", PricingDraftDataHandler),
            ("/api/v1/draft_sample_requirements", SampleRequirementsDraftDataHandler),
            ("/api/v1/element_flowcell/([^/]*$)", ElementFlowcellDataHandler),
            ("/api/v1/flowcells", FlowcellsDataHandler),
            ("/api/v1/flowcell_info2/([^/]*)$", FlowcellsInfoDataHandler),
            ("/api/v1/flowcell_info/([^/]*)$", OldFlowcellsInfoDataHandler),
            ("/api/v1/flowcell_links/([^/]*)$", FlowcellLinksDataHandler),
            ("/api/v1/flowcell_search/([^/]*)$", FlowcellSearchHandler),
            ("/api/v1/flowcell_yield/([^/]*)$", DataFlowcellYieldHandler),
            ("/api/v1/ont_plot/([^/]*)$", ONTFlowcellYieldHandler),
            tornado.web.URLSpec(
                "/api/v1/frag_an_image/(?P<project>[^/]+)/(?P<sample>[^/]+)/(?P<step>[^/]+)",
                FragAnImageHandler,
                name="FragAnImageHandler",
            ),
            ("/api/v1/get_agreement_doc/([^/]*)$", AgreementDataHandler),
            ("/api/v1/get_agreement_template_text", AgreementTemplateTextHandler),
            ("/api/v1/get_order_det_invoicing/([^/]*)", InvoicingOrderDetailsHandler),
            ("/api/v1/get_sent_invoices", SentInvoiceHandler),
            ("/api/v1/generate_invoice", GenerateInvoiceHandler),
            ("/api/v1/generate_invoice_spec", InvoiceSpecDateHandler),
            ("/api/v1/invoice_spec_list", InvoicingPageDataHandler),
            ("/api/v1/instrument_logs", DataInstrumentLogsHandler),
            ("/api/v1/instrument_logs/([^/]*)/([^/]*)$", DataInstrumentLogsHandler),
            ("/api/v1/instrument_names", InstrumentNamesHandler),
            ("/api/v1/invoicing_notes/([^/]*)", InvoicingNotesHandler),
            ("/api/v1/lanes_ordered", LanesOrderedDataHandler),
            ("/api/v1/last_psul", LastPSULRunHandler),
            ("/api/v1/latest_sticky_run_note/([^/]*)", LatestStickyNoteHandler),
            ("/api/v1/latest_sticky_run_note", LatestStickyNotesMultipleHandler),
            ("/api/v1/libpooling_queues", LibraryPoolingQueuesDataHandler),
            ("/api/v1/lims_project_data/([^/]*)$", LIMSProjectCloningHandler),
            ("/api/v1/list_people_assignments", PeopleAssignmentsDataHandler),
            ("/api/v1/mark_agreement_signed", AgreementMarkSignHandler),
            ("/api/v1/pricing_date_to_version", PricingDateToVersionDataHandler),
            ("/api/v1/pricing_exchange_rates", PricingExchangeRatesDataHandler),
            ("/api/v1/pricing_publish_draft", PricingPublishDataHandler),
            ("/api/v1/pricing_reassign_lock", PricingReassignLockDataHandler),
            ("/api/v1/pricing_validate_draft", PricingValidateDraftDataHandler),
            ("/api/v1/prio_projects", PrioProjectsTableHandler),
            ("/api/v1/proj_staged/([^/]*)$", DataDeliveryHandler),
            ("/api/v1/projects", ProjectsDataHandler),
            ("/api/v1/project/([^/]*)$", ProjectSamplesDataHandler),
            ("/api/v1/project/([^/]*)/people", ProjectPeopleAssignmentDataHandler),
            (
                "/api/v1/project/([^/]*)/people/([^/]*)$",
                ProjectPeopleAssignmentDataHandler,
            ),
            ("/api/v1/project/([^/]*)/tickets", ProjectTicketsDataHandler),
            ("/api/v1/project_count_details", ProjectCreationCountDetailsDataHandler),
            ("/api/v1/project_creation_form", ProjectCreationFormDataHandler),
            ("/api/v1/project_creation_form_edit", ProjectEditingDataHandler),
            ("/api/v1/project_creation_forms", ProjectCreationListFormsDataHandler),
            ("/api/v1/projects_fields", ProjectsFieldsDataHandler),
            ("/api/v1/project_reads_sequenced/([^/]*)$", ProjectReadsSequencedHandler),
            ("/api/v1/project_summary/([^/]*)$", ProjectDataHandler),
            ("/api/v1/project_search/([^/]*)$", ProjectsSearchHandler),
            ("/api/v1/project_websocket", ProjectCardsWebSocket),
            ("/api/v1/presets", PresetsHandler),
            ("/api/v1/presets/onloadcheck", PresetsOnLoadHandler),
            ("/api/v1/qpcr_pools", qPCRPoolsDataHandler),
            ("/api/v1/rna_report/([^/]*$)", ProjectRNAMetaDataHandler),
            ("/api/v1/read_totals/([^/]*)$", ReadTotalsDataHandler),
            ("/api/v1/user_management/roles_teams", RolesAndTeamsHandler),
            ("/api/v1/running_notes/([^/]*)$", RunningNotesDataHandler),
            ("/api/v1/links/([^/]*)$", LinksDataHandler),
            ("/api/v1/sample_requirements", SampleRequirementsDataHandler),
            (
                "/api/v1/sample_requirements_publish_draft",
                SampleRequirementsPublishDataHandler,
            ),
            (
                "/api/v1/sample_requirements_validate_draft",
                SampleRequirementsValidateDraftDataHandler,
            ),
            (
                "/api/v1/sample_requirements_reassign_lock",
                SampleRequirementsReassignLockDataHandler,
            ),
            ("/api/v1/save_quote", SaveQuoteHandler),
            ("/api/v1/sequencing_queues", SequencingQueuesDataHandler),
            ("/api/v1/sensorpush", SensorpushDataHandler),
            ("/api/v1/sensorpush_warnings", SensorpushWarningsDataHandler),
            ("/api/v1/smartseq3_progress", SmartSeq3ProgressPageDataHandler),
            ("/api/v1/stats", StatsAggregationHandler),
            ("/api/v1/stats/application_open_projects", ApplicationOpenProjectsHandler),
            ("/api/v1/stats/application_open_samples", ApplicationOpenSamplesHandler),
            ("/api/v1/stats/week_instr_yield", WeekInstrumentTypeYieldHandler),
            ("/api/v1/stats/year_application", YearApplicationsProjectHandler),
            ("/api/v1/stats/year_application_samples", YearApplicationsSamplesHandler),
            ("/api/v1/stats/year_affiliation_projects", YearAffiliationProjectsHandler),
            (
                "/api/v1/stats/year_deliverytime_projects",
                YearDeliverytimeProjectsHandler,
            ),
            (
                "/api/v1/stats/year_deliverytime_application",
                YearDeliverytimeApplicationHandler,
            ),
            ("/api/v1/deliveries/set_bioinfo_responsible$", DeliveriesPageHandler),
            ("/api/v1/submit_project_creation_form", ProjectCreationDataHandler),
            (
                "/api/v1/project_creation_data_fetch",
                ProjectCreationIndividualDataFetchHandler,
            ),
            ("/api/v1/suggestions", SuggestionBoxDataHandler),
            (r"/api/v1/test/(\w+)?", TestDataHandler),
            ("/api/v1/time_tracking", TimeTrackingDataHandler),
            ("/api/v1/user_management/users", UserManagementDataHandler),
            ("/api/v1/workset/([^/]*)$", WorksetDataHandler),
            ("/api/v1/worksets", WorksetsDataHandler),
            ("/api/v1/workset_search/([^/]*)$", WorksetSearchHandler),
            ("/api/v1/workset_links/([^/]*)$", WorksetLinksHandler),
            ("/api/v1/workset_queues", WorksetQueuesDataHandler),
            ("/api/v1/closed_worksets", ClosedWorksetsHandler),
            ("/api/v1/demux_sample_info/([^/]*)$", DemuxSampleInfoDataHandler),
            (
                "/api/v1/demux_sample_info/([^/]*)/sample/([^/]*)/([^/]*)$",
                SampleDeleteHandler,
            ),
            ("/api/v1/demux_configuration", DemuxConfigurationHandler),
            ("/api/v1/demux_configuration/([^/]*)$", DemuxConfigurationDetailHandler),
            ("/barcode", BarcodeHandler),
            ("/controls", ControlsHandler),
            ("/applications", ApplicationsHandler),
            ("/application/([^/]*)$", ApplicationHandler),
            ("/bioinfo/(P[^/]*)$", BioinfoAnalysisHandler),
            ("/clone_project", CloneProjectHandler),
            ("/deliveries", DeliveriesPageHandler),
            ("/flowcells", FlowcellsHandler),
            (r"/flowcells/(\d{6,8}_[^/]*)$", FlowcellHandler),
            (r"/flowcells_element/([^/]*)$", ElementFlowcellHandler),
            (rf"/flowcells_ont/({ONT_RUN_PATTERN})$", ONTFlowcellHandler),
            (
                rf"/flowcells_ont/({ONT_RUN_PATTERN})/minknow_report$",
                ONTMinKNOWReportHandler,
            ),
            (
                rf"/flowcells_ont/({ONT_RUN_PATTERN})/toulligqc_report$",
                ONTToulligQCReportHandler,
            ),
            ("/flowcells_plot", FlowcellPlotHandler),
            ("/10X_chromium_hashtag_csv", HashTagCSVHandler),
            ("/ont_flowcells_plot", ONTFlowcellPlotHandler),
            ("/data_delivered_plot", DeliveryPlotHandler),
            ("/generate_quote", GenerateQuoteHandler),
            ("/instrument_logs", InstrumentLogsHandler),
            ("/instrument_logs/([^/]*)$", InstrumentLogsHandler),
            ("/invoicing", InvoicingPageHandler),
            ("/lanes_ordered", LanesOrderedHandler),
            ("/libpooling_queues", LibraryPoolingQueuesHandler),
            ("/multiqc_report/([^/]*)$", MultiQCReportHandler),
            ("/ngisweden_stats", NGISwedenHandler),
            ("/pools_qpcr", qPCRPoolsHandler),
            ("/pricing_preview", PricingPreviewHandler),
            ("/pricing_quote", PricingQuoteHandler),
            ("/pricing_update", PricingUpdateHandler),
            ("/production/cronjobs", ProductionCronjobsHandler),
            ("/project/([^/]*)$", ProjectSamplesOldHandler),
            ("/project_new/([^/]*)$", ProjectSamplesHandler),
            ("/project_creation", ProjectCreationHandler),
            ("/project_creation_edit/([^/]*)$", ProjectEditingHandler),
            ("/project_creation_forms", ProjectCreationListFormsHandler),
            ("/projects", ProjectsHandler),
            ("/project_cards", ProjectCardsHandler),
            ("/proj_meta", ProjMetaCompareHandler),
            ("/proj_summary_report/([^/]*)$", ProjectSummaryReportHandler),
            ("/read_totals/([^/]*)$", ReadTotalsHandler),
            ("/rec_ctrl_view/([^/]*)$", RecCtrlDataHandler),
            ("/sample_requirements", SampleRequirementsViewHandler),
            ("/sample_requirements_preview", SampleRequirementsPreviewHandler),
            ("/sample_requirements_update", SampleRequirementsUpdateHandler),
            ("/demux_sample_info_editor", DemuxSampleInfoEditorHandler),
            ("/sensorpush", SensorpushHandler),
            ("/sequencing_queues", SequencingQueuesHandler),
            ("/yield_calculator", YieldCalculatorHandler),
            (
                "/singlecell_sample_summary_report/(P[^/]*)/([^/]*)/([^/]*)$",
                SingleCellSampleSummaryReportHandler,
            ),
            ("/smartseq3_progress", SmartSeq3ProgressPageHandler),
            ("/suggestion_box", SuggestionBoxHandler),
            ("/time_tracking", TimeTrackingHandler),
            ("/user_management", UserManagementHandler),
            ("/userpref", UserPrefPageHandler),
            ("/userpref_b5", UserPrefPageHandler_b5),
            (
                "/visium_sample_summary_report/(P[^/]*)/([^/]*)$",
                VisiumReportHandler,
            ),
            ("/worksets", WorksetsHandler),
            ("/workset_queues", WorksetQueuesHandler),
            ("/workset/([^/]*)$", WorksetHandler),
            (r".*", BaseHandler),
        ]

        self.declared_handlers = handlers

        # Load templates
        self.loader = template.Loader("design")

        # Global connection to the database
        cloudant = cloudant_v1.CloudantV1(
            authenticator=CouchDbSessionAuthenticator(
                settings.get("couch_username"), settings.get("couch_password")
            )
        )
        cloudant.set_service_url(settings.get("couch_url"))
        if cloudant:
            self.cloudant = cloudant

        try:
            self.genstat_defaults = self.cloudant.get_document(
                db="gs_configs", doc_id="genstat_defaults"
            ).get_result()
        except ApiException as e:
            if e.status_code == 404:
                raise RuntimeError(
                    "genstat-defaults doc not found in gs_configs, please "
                    "make sure that the doc is available with the "
                    "corresponding defaults information."
                )

        # If settings states  mode, no authentication is used
        self.test_mode = settings["Testing mode"]

        # google oauth key
        self.oauth_key = settings["google_oauth"]["key"]

        # ZenDesk
        self.zendesk_url = settings["zendesk"]["url"]
        self.zendesk_user = settings["zendesk"]["username"]
        self.zendesk_token = settings["zendesk"]["token"]
        self.zendesk = Zenpy(
            email=self.zendesk_user,
            token=self.zendesk_token,
            subdomain=urlsplit(self.zendesk_url).hostname.split(".")[0],
        )

        # Jira
        self.jira_url = settings["jira"]["url"]
        self.jira_user = settings["jira"]["user"]
        self.jira_api_token = settings["jira"]["api_token"]
        self.jira_project_key = settings["jira"]["project_key"]

        # Slack
        self.slack_token = settings["slack"]["token"]

        # Location of the psul log
        self.psul_log = settings.get("psul_log")

        # to display instruments in the server status
        self.server_status = settings.get("server_status")

        # Load named indices from config directory
        self.named_indices = self._load_named_indices(settings.get("config_dir", "."))

        # project summary - reports tab
        # Structure of the reports folder:
        # <reports_path>/
        # ├── other_reports/
        # │    └── toulligqc_reports/
        # ├── minknow_reports/
        # ├── mqc_reports/
        # ├── Visium/<project_id>/
        # └── yggdrasil/<project_id>/
        self.reports_path = settings.get("reports_path")
        self.report_path = {}
        self.report_path["minknow"] = Path(self.reports_path, "minknow_reports")
        self.report_path["multiqc"] = Path(self.reports_path, "mqc_reports")
        self.report_path["toulligqc"] = Path(
            self.reports_path, "other_reports", "toulligqc_reports"
        )
        self.report_path["visium"] = Path(self.reports_path, "Visium")
        self.report_path["yggdrasil"] = Path(self.reports_path, "yggdrasil")

        # lims backend credentials
        limsbackend_cred_loc = Path(
            settings["lims_backend_credential_location"]
        ).expanduser()
        with limsbackend_cred_loc.open() as cred_file:
            self.lims_conf = yaml.safe_load(cred_file)

        order_portal_cred_loc = Path(
            settings["order_portal_credential_location"]
        ).expanduser()
        with order_portal_cred_loc.open() as cred_file:
            self.order_portal_conf = yaml.safe_load(cred_file)["order_portal"]

        # Add LIMS URL to globals for templates
        self.gs_globals["lims_url"] = self.lims_conf.get("url", "")

        # Setup the Tornado Application

        settings["debug"] = True
        settings["static_path"] = "static"
        settings["login_url"] = "/login"

        if options["develop"]:
            tornado.autoreload.watch("design/application.html")
            tornado.autoreload.watch("design/applications.html")
            tornado.autoreload.watch("design/barcode.html")
            tornado.autoreload.watch("design/base.html")
            tornado.autoreload.watch("design/base_b5.html")
            tornado.autoreload.watch("design/bioinfo_tab.html")
            tornado.autoreload.watch("design/bioinfo_tab/run_lane_sample_view.html")
            tornado.autoreload.watch("design/bioinfo_tab/sample_run_lane_view.html")
            tornado.autoreload.watch("design/controls.html")
            tornado.autoreload.watch("design/cronjobs.html")
            tornado.autoreload.watch("design/clone_project.html")
            tornado.autoreload.watch("design/data_delivered_plot.html")
            tornado.autoreload.watch("design/deliveries.html")
            tornado.autoreload.watch("design/error_page.html")
            tornado.autoreload.watch("design/flowcell.html")
            tornado.autoreload.watch("design/flowcell_error.html")
            tornado.autoreload.watch("design/flowcell_trend_plot.html")
            tornado.autoreload.watch("design/flowcells.html")
            tornado.autoreload.watch("design/index.html")
            tornado.autoreload.watch("design/instrument_logs.html")
            tornado.autoreload.watch("design/invoicing.html")
            tornado.autoreload.watch("design/lanes_ordered.html")
            tornado.autoreload.watch("design/link_tab.html")
            tornado.autoreload.watch("design/ngisweden_stats.html")
            tornado.autoreload.watch("design/ont_flowcell.html")
            tornado.autoreload.watch("design/ont_flowcells.html")
            tornado.autoreload.watch("design/ont_trend_plot.html")
            tornado.autoreload.watch("design/qpcr_pools.html")
            tornado.autoreload.watch("design/pricing_products.html")
            tornado.autoreload.watch("design/pricing_quote.html")
            tornado.autoreload.watch("design/pricing_quote_tbody.html")
            tornado.autoreload.watch("design/proj_meta_compare.html")
            tornado.autoreload.watch("design/project_samples.html")
            tornado.autoreload.watch("design/project_samples_old.html")
            tornado.autoreload.watch("design/projects.html")
            tornado.autoreload.watch("design/project_cards.html")
            tornado.autoreload.watch("design/read_totals.html")
            tornado.autoreload.watch("design/rec_ctrl_view.html")
            tornado.autoreload.watch("design/running_notes_help.html")
            tornado.autoreload.watch("design/running_notes_tab.html")
            tornado.autoreload.watch("design/sensorpush.html")
            tornado.autoreload.watch("design/suggestion_box.html")
            tornado.autoreload.watch("design/unauthorized.html")
            tornado.autoreload.watch("design/user_management.html")
            tornado.autoreload.watch("design/user_preferences.html")
            tornado.autoreload.watch("design/workset_samples.html")
            tornado.autoreload.watch("design/worksets.html")

        tornado.web.Application.__init__(self, handlers, **settings)

    def _load_named_indices(self, config_dir):
        """Load named indices from CSV files in the named_indices directory.

        Args:
            config_dir: Path to the configuration directory

        Returns:
            Dictionary mapping file names to dictionaries of named index to list of sequence lists.
            Each sequence list contains 1-2 items in order (i7, optionally i5).
        """
        named_indices = {}
        named_indices_dir = Path(config_dir) / "named_indices"

        if not named_indices_dir.exists():
            logging.warning(f"Named indices directory not found: {named_indices_dir}")
            return named_indices

        # Read all CSV files in the directory
        for csv_file in named_indices_dir.glob("*.csv"):
            try:
                file_key = csv_file.stem  # Get filename without extension
                file_indices = {}

                with csv_file.open("r") as f:
                    reader = csv.reader(f)
                    for row in reader:
                        if row:  # Skip empty rows
                            named_index = row[0]
                            sequences = row[1:]

                            # Validate sequence count (max 2: i7 and i5)
                            if len(sequences) > 2:
                                logging.warning(
                                    f"Row for '{named_index}' in {csv_file.name} has {len(sequences)} sequences, "
                                    f"expected max 2 (i7 and i5). Using only first 2."
                                )
                                sequences = sequences[:2]

                            # Add to file_indices (named index can appear multiple times)
                            if named_index in file_indices:
                                file_indices[named_index].append(sequences)
                            else:
                                file_indices[named_index] = [sequences]

                named_indices[file_key] = file_indices
                logging.info(f"Loaded indices from {csv_file.name}")
            except Exception as e:
                logging.error(f"Error loading named indices from {csv_file}: {e}")

        logging.info(
            f"Loaded {len(named_indices)} named index files from {named_indices_dir}"
        )

        return named_indices


if __name__ == "__main__":
    # Tornado built-in command line parsing. Auto configures logging
    define(
        "testing_mode",
        default=False,
        help=(
            "WARNING, this option disables "
            "all security measures, use only "
            "for testing purposes"
        ),
    )
    define(
        "develop",
        default=False,
        help=(
            "Define develop mode to look for changes "
            "in files and automatically reloading them"
        ),
    )

    define(
        "port", default=9761, type=int, help="The port that the server will listen to."
    )

    define(
        "config_dir",
        default="~/conf",
        type=str,
        help="Path to the directory containing configuration files",
    )
    # After parsing the command line, the command line flags are stored in tornado.options
    tornado.options.parse_command_line()
    logging_format = f"%(color)s[%(levelname)1.1s %(asctime)s %(module)s:%(lineno)d] [port:{options['port']}]%(end_color)s %(message)s"
    log_formatter = LogFormatter(fmt=logging_format, color=True)
    logging.getLogger().handlers[0].setFormatter(log_formatter)

    # Configuration directory path from command line
    config_dir = Path(options["config_dir"]).expanduser()

    # Load configuration file
    with open("settings.yaml") as settings_file:
        server_settings = yaml.full_load(settings_file)

    server_settings["Testing mode"] = options["testing_mode"]
    server_settings["config_dir"] = config_dir

    if "cookie_secret" not in server_settings:
        cookie_secret = base64.b64encode(uuid.uuid4().bytes + uuid.uuid4().bytes)
        server_settings["cookie_secret"] = cookie_secret

    # Instantiate Application
    application = Application(server_settings)

    # Load ssl certificate and key files
    ssl_cert = server_settings.get("ssl_cert", None)
    ssl_key = server_settings.get("ssl_key", None)

    if ssl_cert and ssl_key:
        ssl_options = {"certfile": ssl_cert, "keyfile": ssl_key}
    else:
        ssl_options = None

    # Start HTTP Server
    http_server = tornado.httpserver.HTTPServer(application, ssl_options=ssl_options)

    http_server.listen(options["port"])

    # Get a handle to the instance of IOLoop
    ioloop = tornado.ioloop.IOLoop.instance()

    application.ioloop = ioloop

    # Start the IOLoop
    ioloop.start()
