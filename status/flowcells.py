"""Set of handlers related with Flowcells"""

import datetime
import json
import logging
from collections import OrderedDict

from dateutil.relativedelta import relativedelta
from genologics import lims
from genologics.config import BASEURI, PASSWORD, USERNAME

from status.flowcell import get_project_names_from_ids, get_q30_threshold, thresholds
from status.running_notes import LatestRunningNoteHandler
from status.util import SafeHandler

application_log = logging.getLogger("tornado.application")

lims = lims.Lims(BASEURI, USERNAME, PASSWORD)


class FlowcellsHandler(SafeHandler):
    """Serves a page which lists all flowcells with some brief info.
    By default shows only flowcells form the last 6 months, use the parameter
    'all' to show all flowcells.
    """

    def list_flowcells(self, all=False):
        temp_flowcells = {}
        if all:
            fc_view = self.application.cloudant.post_view(
                db="flowcells",
                ddoc="info",
                view="summary",
                descending=True,
            ).get_result()["rows"]
            for row in fc_view:
                temp_flowcells[row["key"]] = row["value"]

            xfc_view = self.application.cloudant.post_view(
                db="x_flowcells",
                ddoc="info",
                view="summary",
                descending=True,
            ).get_result()["rows"]
        else:
            # fc_view are from 2016 and older so only include xfc_view here
            half_a_year_ago = (
                datetime.datetime.now() - relativedelta(months=6)
            ).strftime("%y%m%d")
            xfc_view = self.application.cloudant.post_view(
                db="x_flowcells",
                ddoc="info",
                view="summary",
                descending=True,
                end_key=half_a_year_ago,
            ).get_result()["rows"]
        note_keys = []
        x_flowcells_rundirs = set()
        for row in xfc_view:
            try:
                row["value"]["startdate"] = datetime.datetime.strptime(
                    row["value"]["startdate"], "%y%m%d"
                ).strftime("%Y-%m-%d")
            except ValueError:
                try:
                    row["value"]["startdate"] = datetime.datetime.strptime(
                        row["value"]["startdate"], "%Y-%m-%dT%H:%M:%SZ"
                    ).strftime("%Y-%m-%d")
                except ValueError:
                    row["value"]["startdate"] = datetime.datetime.strptime(
                        row["value"]["startdate"].split()[0], "%m/%d/%Y"
                    ).strftime("%Y-%m-%d")

            # Lanes were previously in the wrong order
            row["value"]["lane_info"] = OrderedDict(
                sorted(row["value"]["lane_info"].items())
            )
            note_key = row["key"]
            # NovaSeqXPlus has whole year in name
            if "LH" in row["value"]["instrument"]:
                note_key = f"{row['value']['run id'].split('_')[0]}_{row['value']['run id'].split('_')[-1]}"
            note_keys.append(note_key)
            # Mark that this flowcell was found in x_flowcells
            row["value"]["in_x_flowcells"] = True
            row["value"]["in_flowcell_status"] = False
            temp_flowcells[row["key"]] = row["value"]
            # Collect run id for deduplication with flowcell_status
            if row["value"].get("run id"):
                x_flowcells_rundirs.add(row["value"]["run id"])

        # Query flowcell_status database and merge entries that don't exist in x_flowcells
        has_flowcell_status_entries = False
        try:
            six_months_ago = (
                datetime.datetime.now() - relativedelta(months=6)
            ).strftime("%Y-%m-%d")

            flowcell_status_view_params = {
                "db": "flowcell_status",
                "ddoc": "summary",
                "view": "date_flowcell_id",
                "descending": True,
            }

            if not all:
                # With descending=True, end_key specifies where to stop
                flowcell_status_view_params["end_key"] = [
                    six_months_ago.replace("-", "")
                ]
            # When all=True, fetch everything (no limit needed)

            flowcell_status_rows = (
                self.application.cloudant.post_view(**flowcell_status_view_params)
                .get_result()
                .get("rows", [])
            )

            # Process flowcell_status entries
            for row in flowcell_status_rows:
                key = row.get("key", [])
                if len(key) < 2:
                    continue

                flowcell_id = key[1]
                value = row.get("value", {})
                runfolder_id = value.get("runfolder_id")

                # Skip if this runfolder already exists in x_flowcells
                # This ensures x_flowcells takes precedence
                if runfolder_id and runfolder_id in x_flowcells_rundirs:
                    continue

                # Special case: MiSeq i100 flowcells may have "A" prepended in flowcell_status
                # Check if removing the "A" matches an existing x_flowcells entry
                if runfolder_id and runfolder_id.startswith("A"):
                    without_a = runfolder_id[1:]
                    if without_a in x_flowcells_rundirs:
                        continue

                # Format startdate from sequencing_started_timestamp
                startdate = "N/A"
                seq_started_ts = value.get("sequencing_started_timestamp")
                if seq_started_ts:
                    try:
                        startdate = datetime.datetime.strptime(
                            seq_started_ts.split("T")[0], "%Y-%m-%d"
                        ).strftime("%Y-%m-%d")
                    except (ValueError, AttributeError):
                        pass

                # Fallback: extract date from runfolder_id if startdate is still N/A
                if startdate == "N/A" and runfolder_id:
                    try:
                        # runfolder_id typically starts with YYMMDD or YYYYMMDD
                        date_part = runfolder_id.split("_")[0]
                        if date_part.isdigit():
                            if len(date_part) == 6:
                                # YYMMDD format - add "20" prefix
                                startdate = datetime.datetime.strptime(
                                    "20" + date_part, "%Y%m%d"
                                ).strftime("%Y-%m-%d")
                            elif len(date_part) == 8:
                                # YYYYMMDD format
                                startdate = datetime.datetime.strptime(
                                    date_part, "%Y%m%d"
                                ).strftime("%Y-%m-%d")
                    except (ValueError, IndexError, AttributeError):
                        pass

                # Create x_flowcells-compatible structure for flowcell_status entry
                # Note: instrument_type, run_mode, and actual_run_setup will be populated from demux_sample_info
                fc_status_entry = {
                    "run id": runfolder_id or flowcell_id,
                    "flowcell_id": flowcell_id,
                    "startdate": startdate,
                    "run_mode": value.get("run_mode", ""),
                    "actual_run_setup": value.get("actual_run_setup", ""),
                    "lane_info": value.get("lane_info", {}),
                    "instrument": value.get("instrument", ""),
                    "source": "flowcell_status",
                    "sequencing_started": value.get("sequencing_started", False),
                    "sequencing_finished": value.get("sequencing_finished", False),
                    "demultiplexing": None,  # Not available for flowcell_status
                    "in_flowcell_status": True,
                    "in_x_flowcells": False,  # Will be updated if merged
                }

                # Use flowcell_id as key for flowcell_status entries
                if flowcell_id in temp_flowcells:
                    # Merge existing entry with flowcell_status data, giving precedence to x_flowcells data
                    existing_entry = temp_flowcells[flowcell_id]
                    merged_entry = {**fc_status_entry, **existing_entry}
                    # This flowcell exists in both databases
                    merged_entry["in_flowcell_status"] = True
                    merged_entry["in_x_flowcells"] = True
                    temp_flowcells[flowcell_id] = merged_entry
                else:
                    temp_flowcells[flowcell_id] = fc_status_entry

                # Track that we have at least one flowcell_status entry
                has_flowcell_status_entries = True

                # Add to note_keys for running notes lookup
                note_key = runfolder_id or flowcell_id
                note_keys.append(note_key)

        except Exception as e:
            application_log.warning(f"Failed to fetch flowcell_status: {str(e)}")

        # Query demux_sample_info to get instrument_type, run_mode, and run_setup
        # Only for flowcell_status entries that are not in x_flowcells
        if has_flowcell_status_entries:
            try:
                demux_view_params = {
                    "db": "demux_sample_info",
                    "ddoc": "summary",
                    "view": "date_flowcell_id",
                    "include_docs": False,
                    "descending": True,
                }

                if not all:
                    # Match the time range used for flowcell_status
                    demux_view_params["end_key"] = [six_months_ago]
                # When all=True, fetch everything (no limit)

                demux_rows = (
                    self.application.cloudant.post_view(**demux_view_params)
                    .get_result()
                    .get("rows", [])
                )

                # Build a lookup dict for instrument_type, run_mode, and run_setup from demux_sample_info
                demux_data = {}
                for row in demux_rows:
                    key = row.get("key", [])
                    if len(key) >= 2:
                        fc_id = key[1]
                        value = row.get("value", {})
                        demux_data[fc_id] = {
                            "instrument_type": value.get("instrument_type"),
                            "run_mode": value.get("run_mode"),
                            "run_setup": value.get("run_setup"),
                        }

                # Update only flowcell_status entries with data from demux_sample_info
                for fc_key, fc_data in temp_flowcells.items():
                    # Only apply to flowcells from flowcell_status that are not in x_flowcells
                    if fc_data.get("source") == "flowcell_status":
                        flowcell_id = fc_data.get("flowcell_id", fc_key)

                        # Determine which ID to use for lookup
                        lookup_id = flowcell_id
                        if flowcell_id not in demux_data and flowcell_id.startswith(
                            "A"
                        ):
                            # Handle A-prefix case: if flowcell has "A000..." try "000..."
                            without_a = flowcell_id[1:]
                            if without_a in demux_data:
                                lookup_id = without_a

                        # Apply demux data if found
                        if lookup_id in demux_data:
                            demux_info = demux_data[lookup_id]
                            instrument_type = demux_info.get("instrument_type")
                            run_mode = demux_info.get("run_mode")

                            # Set instrument field
                            if instrument_type:
                                fc_data["instrument"] = instrument_type

                            # Combine instrument_type and run_mode like x_flowcells does
                            if instrument_type and run_mode:
                                fc_data["run_mode"] = f"{instrument_type} {run_mode}"
                            elif run_mode:
                                fc_data["run_mode"] = run_mode
                            elif instrument_type:
                                fc_data["run_mode"] = instrument_type

                            # Set run_setup
                            if demux_info.get("run_setup"):
                                # Run setup in samplesheet_generator epp is formatted as
                                # f"{process.udf.get('Read 1 Cycles', '0')}_{process.udf.get('Index Read 1', '0')}_{process.udf.get('Index Read 2', '0')}_{process.udf.get('Read 2 Cycles', '0')}"
                                # Transform it to a more human-readable format like "151nt(R1)-8nt(I1)-8nt(I2)-151nt(R2)"
                                r1, i1, i2, r2 = demux_info["run_setup"].split("_")
                                fc_data["actual_run_setup"] = (
                                    f"{r1}nt(R1){f'-{i1}nt(I1)' if i1 != '0' else ''}"
                                    f"{f'-{i2}nt(I2)' if i2 != '0' else ''}{f'-{r2}nt(R2)' if r2 != '0' else ''}"
                                )

            except Exception as e:
                application_log.warning(
                    f"Failed to fetch demux_sample_info for instrument_type/run_mode/run_setup: {str(e)}"
                )

        notes = self.application.cloudant.post_view(
            db="running_notes",
            ddoc="latest_note_previews",
            view="flowcell",
            reduce=True,
            group=True,
            keys=list(note_keys),
        ).get_result()["rows"]
        for row in notes:
            key = row["key"]
            # NovaSeqXPlus FCs have the complete year in the date as part of the name, which is shortened in
            # some views in x_flowcells db but not in running_notes db. Hence why we require a sort of
            # translation as below
            if len(row["key"].split("_")[0]) > 6:
                elem = row["key"].split("_")
                elem[0] = elem[0][2:]
                key = "_".join(elem)
            temp_flowcells[key]["latest_running_note"] = {
                row["value"]["created_at_utc"]: row["value"]
            }

        # Sort flowcells by date (most recent first)
        # Priority: startdate, then run id, then flowcell key
        def get_sort_key(item):
            key, fc = item

            # Try startdate first (format: YYYY-MM-DD)
            startdate = fc.get("startdate")
            if startdate and startdate != "N/A":
                try:
                    # Remove dashes for string sorting: YYYY-MM-DD -> YYYYMMDD
                    return startdate.replace("-", "")
                except (AttributeError, ValueError):
                    pass

            # Try run id (often starts with date like YYMMDD or YYYYMMDD)
            run_id = fc.get("run id")
            if run_id:
                parts = run_id.split("_")
                if parts and parts[0].isdigit():
                    # If starts with 6 digits (YYMMDD), prefix with '20'
                    if len(parts[0]) == 6:
                        return "20" + run_id
                    # Already 8 digits (YYYYMMDD) or other format
                    return run_id

            # Fallback to key (flowcell ID)
            return key

        sorted_flowcells = sorted(
            temp_flowcells.items(), key=get_sort_key, reverse=True
        )
        return OrderedDict(sorted_flowcells)

    def list_ont_flowcells(self, unfetched_runs):
        """Load the rows of the nanopore_runs:info/all_stats view
        and convert into {run_name: stats} dict.
        """

        view_all_stats_rows = self.application.cloudant.post_view(
            db="nanopore_runs",
            ddoc="info",
            view="all_stats",
            descending=True,
        ).get_result()["rows"]

        ont_runs = {row["key"]: row["value"] for row in view_all_stats_rows}

        # Format readability of quantitative data
        for run_name, all_stats in ont_runs.items():
            try:
                if all_stats.get("basecalled_pass_bases"):
                    all_stats["basecalled_pass_bases_Gbp"] = (
                        f"{int(all_stats['basecalled_pass_bases']) / 1e9:,.2f}"
                    )
                if all_stats.get("basecalled_pass_read_count"):
                    all_stats["basecalled_pass_read_count_M"] = (
                        f"{int(all_stats['basecalled_pass_read_count']) / 1e6:,.2f}"
                    )
                if all_stats.get("n50"):
                    all_stats["n50_Kbp"] = f"{int(all_stats['n50']) / 1e3:,.2f}"
                if (
                    all_stats.get("basecalled_fail_bases")
                    and all_stats.get("basecalled_pass_bases")
                    and int(all_stats["basecalled_pass_bases"])
                    + int(all_stats["basecalled_fail_bases"])
                    > 0
                ):
                    all_stats["accuracy"] = (
                        f"{int(all_stats['basecalled_pass_bases']) / (int(all_stats['basecalled_pass_bases']) + int(all_stats['basecalled_fail_bases'])) * 100:.2f}"
                    )

                # QC
                try:
                    if all_stats["pore_count_history"][0]["type"] == "qc":
                        all_stats["qc"] = all_stats["pore_count_history"][0][
                            "num_pores"
                        ]
                except (KeyError, IndexError):
                    pass

                all_stats["latest_running_note"] = (
                    LatestRunningNoteHandler.get_latest_running_note(
                        self.application, "flowcell", run_name
                    )
                )
                # Get project names and IDs
                try:
                    sample_data = all_stats["lims"]["loading"][-1]["sample_data"]
                except KeyError:
                    continue
                else:
                    projects = {}
                    for sample_dict in sample_data:
                        if sample_dict["project_id"] not in projects.keys():
                            projects[sample_dict["project_id"]] = sample_dict[
                                "project_name"
                            ]
                    all_stats["projects"] = projects

                    # Get library name and ID
                    if "ont_pool_name" in sample_data[0]:
                        library_name = sample_data[0]["ont_pool_name"]
                        library_id = sample_data[0]["ont_pool_id"]
                    else:
                        library_name = sample_data[0]["sample_name"]
                        library_id = sample_data[0]["sample_id"]
                    all_stats["library_name"] = library_name
                    all_stats["library_id"] = library_id

                    # Get step ID
                    all_stats["step_id"] = all_stats["lims"]["loading"][-1]["step_id"]

            except Exception as e:
                application_log.warning(f"Error parsing {run_name}: {e}", exc_info=True)
                unfetched_runs.append(run_name)

        return ont_runs

    def list_element_flowcells(self):
        rows = self.application.cloudant.post_view(
            db="element_runs",
            ddoc="info",
            view="summary",
            descending=True,
        ).get_result()["rows"]

        element_runs = {}
        for row in rows:
            run_name = row["key"]
            values = row["value"]
            values["start_date"] = datetime.datetime.strptime(
                run_name[:8], "%Y%m%d"
            ).strftime("%Y-%m-%d")

            cycles = values.get("Cycles", {})
            cycles_str = f"{cycles.get('R1')}nt(R1)-{cycles.get('I1')}nt(I1)"
            if cycles.get("R2"):
                cycles_str += f"-{cycles.get('I2')}nt(I2)-{cycles.get('R2')}nt(R2)"
            values["Cycles"] = cycles_str

            project_ids = self.application.cloudant.post_view(
                db="element_runs",
                ddoc="names",
                view="project_ids_list",
                key=run_name,
            ).get_result()["rows"][0]["value"]
            values["projects"] = get_project_names_from_ids(
                project_ids, self.application.cloudant
            )

            values["latest_running_note"] = (
                LatestRunningNoteHandler.get_latest_running_note(
                    self.application, "flowcell", run_name
                )
            )
            element_runs[run_name] = values

        return element_runs

    def get(self):
        # Default is to NOT show all flowcells
        all = self.get_argument("all", False)
        t = self.application.loader.load("flowcells.html")
        unfetched_runs = []
        fcs = self.list_flowcells(all=all)
        ont_fcs = self.list_ont_flowcells(unfetched_runs)
        element_fcs = self.list_element_flowcells()
        self.write(
            t.generate(
                gs_globals=self.application.gs_globals,
                thresholds=thresholds,
                get_q30_threshold=get_q30_threshold,
                user=self.get_current_user(),
                flowcells=fcs,
                ont_flowcells=ont_fcs,
                unfetched_runs=unfetched_runs,
                element_fcs=element_fcs,
                form_date=LatestRunningNoteHandler.formatDate,
                all=all,
            )
        )


class FlowcellsDataHandler(SafeHandler):
    """Serves brief information for each flowcell in the database.

    Loaded through /api/v1/flowcells url
    """

    def get(self):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.list_flowcells()))

    def list_flowcells(self):
        flowcells = {}
        fc_view = self.application.cloudant.post_view(
            db="flowcells",
            ddoc="info",
            view="summary",
            descending=True,
        ).get_result()["rows"]
        for row in fc_view:
            flowcells[row["key"]] = row["value"]
        xfc_view = self.application.cloudant.post_view(
            db="x_flowcells",
            ddoc="info",
            view="summary",
            descending=True,
        ).get_result()["rows"]
        for row in xfc_view:
            flowcells[row["key"]] = row["value"]

        return OrderedDict(sorted(flowcells.items()))


class FlowcellsInfoDataHandler(SafeHandler):
    """Serves brief information about a given flowcell.

    Loaded through /api/v1/flowcell_info2/([^/]*)$ url
    """

    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        flowcell_info = self.__class__.get_flowcell_info(self.application, flowcell)
        self.write(json.dumps(flowcell_info))

    @staticmethod
    def get_flowcell_info(application, flowcell):
        fc_view_row = application.cludant.post_view(
            db="flowcells", ddoc="info", view="summary2", descending=True, key=flowcell
        ).get_result()["rows"]
        xfc_view_row = application.cloudant.post_view(
            db="x_flowcells",
            ddoc="info",
            view="summary2_full_id",
            descending=True,
            key=flowcell,
        ).get_result()["rows"]
        flowcell_info = None
        for row in fc_view_row:
            flowcell_info = row["value"]
            break
        for row in xfc_view_row:
            flowcell_info = row["value"]
            break
        if flowcell_info is not None:
            return flowcell_info
        else:
            # No hit for a full name, check if the short name is found:
            complete_flowcell_rows = application.cloudant.post_view(
                db="x_flowcells",
                ddoc="info",
                view="short_name_to_full_name",
                key=flowcell,
            ).get_result()["rows"]

            if complete_flowcell_rows:
                complete_flowcell_id = complete_flowcell_rows[0]["value"]
                view = application.cloudant.post_view(
                    db="x_flowcells",
                    ddoc="info",
                    view="summary2_full_id",
                    key=complete_flowcell_id,
                ).get_result()["rows"]
                if view:
                    return view[0]["value"]
        return flowcell_info


class FlowcellSearchHandler(SafeHandler):
    """Searches Flowcells for text string

    Loaded through /api/v1/flowcell_search/([^/]*)$
    """

    cached_fc_list = None
    cached_xfc_list = None
    cached_ont_fc_list = None
    cached_element_fc_list = None
    last_fetched = None

    def get(self, search_string):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.search_flowcell_names(search_string)))

    def search_flowcell_names(self, search_string=""):
        if len(search_string) == 0:
            return ""
        flowcells = []

        # The list of flowcells is cached for speed improvement
        t_threshold = datetime.datetime.now() - relativedelta(minutes=3)
        if (
            FlowcellSearchHandler.cached_fc_list is None
            or FlowcellSearchHandler.last_fetched < t_threshold
        ):
            fc_view = self.application.cloudant.post_view(
                db="flowcells",
                ddoc="info",
                view="id",
                descending=True,
            ).get_result()["rows"]
            FlowcellSearchHandler.cached_fc_list = [row["key"] for row in fc_view]

            xfc_view = self.application.cloudant.post_view(
                db="x_flowcells",
                ddoc="info",
                view="id",
                descending=True,
            ).get_result()["rows"]
            FlowcellSearchHandler.cached_xfc_list = [row["key"] for row in xfc_view]

            ont_fc_view = self.application.cloudant.post_view(
                db="nanopore_runs",
                ddoc="names",
                view="name",
                descending=True,
            ).get_result()["rows"]
            FlowcellSearchHandler.cached_ont_fc_list = [
                row["key"] for row in ont_fc_view
            ]

            element_fc_view = self.application.cloudant.post_view(
                db="element_runs",
                ddoc="info",
                view="name",
                descending=True,
            ).get_result()["rows"]
            FlowcellSearchHandler.cached_element_fc_list = [
                row["key"] for row in element_fc_view
            ]

            FlowcellSearchHandler.last_fetched = datetime.datetime.now()

        search_string = search_string.lower()

        for row_key in FlowcellSearchHandler.cached_xfc_list:
            try:
                if search_string in row_key.lower():
                    splitted_fc = row_key.split("_")
                    fc = {
                        "url": f"/flowcells/{splitted_fc[0]}_{splitted_fc[-1]}",
                        "name": row_key,
                    }
                    flowcells.append(fc)
            except AttributeError:
                pass

        for row_key in FlowcellSearchHandler.cached_ont_fc_list:
            try:
                if search_string in row_key.lower():
                    fc = {
                        "url": f"/flowcells_ont/{row_key}",
                        "name": row_key,
                    }
                    flowcells.append(fc)
            except AttributeError:
                pass

        for row_key in FlowcellSearchHandler.cached_element_fc_list:
            try:
                if search_string in row_key.lower():
                    fc = {
                        "url": f"/flowcells_element/{row_key}",
                        "name": row_key,
                    }
                    flowcells.append(fc)
            except AttributeError:
                pass

        for row_key in FlowcellSearchHandler.cached_fc_list:
            try:
                if search_string in row_key.lower():
                    splitted_fc = row_key.split("_")
                    fc = {
                        "url": f"/flowcells/{splitted_fc[0]}_{splitted_fc[-1]}",
                        "name": row_key,
                    }
                    flowcells.append(fc)
            except AttributeError:
                pass

        return flowcells


class OldFlowcellsInfoDataHandler(SafeHandler):
    """Serves brief information about a given flowcell.

    Loaded through /api/v1/flowcell_info/([^/]*)$ url
    """

    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.flowcell_info(flowcell)))

    def flowcell_info(self, flowcell):
        fc_view = self.application.cloudant.post_view(
            db="flowcells",
            ddoc="info",
            view="summary",
            descending=True,
            key=flowcell,
        ).get_result()["rows"]
        flowcell_info = fc_view[0]["value"] if fc_view else None

        return flowcell_info


class FlowcellLinksDataHandler(SafeHandler):
    """Serves external links for each project
    Links are stored as JSON in LIMS / project
    URL: /api/v1/links/([^/]*)
    """

    def get(self, flowcell):
        self.set_header("Content-type", "application/json")
        try:
            p = get_container_from_id(flowcell)
        except (KeyError, IndexError):
            self.write("{}")
        else:
            try:
                links = json.loads(p.udf["Links"]) if "Links" in p.udf else {}
            except KeyError:
                links = {}

            # Sort by descending date, then hopefully have deviations on top
            sorted_links = OrderedDict()
            for k, v in sorted(links.items(), key=lambda t: t[0], reverse=True):
                sorted_links[k] = v
            sorted_links = OrderedDict(
                sorted(sorted_links.items(), key=lambda k: k[1]["type"])
            )
            self.write(sorted_links)

    def post(self, flowcell):
        user = self.get_current_user()
        a_type = self.get_argument("type", "")
        title = self.get_argument("title", "")
        url = self.get_argument("url", "")
        desc = self.get_argument("desc", "")

        if not a_type or not title:
            self.set_status(400)
            self.finish("<html><body>Link title and type is required</body></html>")
        else:
            try:
                p = get_container_from_id(flowcell)
            except (KeyError, IndexError):
                self.status(400)
                self.write("Flowcell not found")
            else:
                links = json.loads(p.udf["Links"]) if "Links" in p.udf else {}
                links[str(datetime.datetime.now())] = {
                    "user": user.name,
                    "email": user.email,
                    "type": a_type,
                    "title": title,
                    "url": url,
                    "desc": desc,
                }
                p.udf["Links"] = json.dumps(links)
                p.put()
                self.set_status(200)
                # ajax cries if it does not get anything back
                self.set_header("Content-type", "application/json")
                self.finish(json.dumps(links))


class ReadTotalsHandler(SafeHandler):
    """Serves external links for each project
    Links are stored as JSON in LIMS / project
    URL: /read_totals/([^/]*)
    """

    def get(self, query):
        self.set_header("Content-type", "text/html")
        t = self.application.loader.load("read_totals.html")

        self.write(
            t.generate(
                gs_globals=self.application.gs_globals,
                user=self.get_current_user(),
                query=query,
            )
        )


class ReadTotalsDataHandler(SafeHandler):
    """API endpoint for read totals data

    Loaded through /api/v1/read_totals/([^/]*)$
    Returns JSON with reads data for the given query
    """

    UNIT_YIELD = 600_000_000
    FLOWCELL_YIELD_FACTOR = 0.9
    SAMPLE_YIELD_FACTOR = 0.75

    def get(self, query):
        if not query:
            data = {}
            expected_min_yield_per_sample = None
            expected_min_yield_formula_mode = None
        else:
            data = self.get_total_reads(self.application, query)
            project_run_mode = None
            for sample_rows in data.values():
                for row in sample_rows:
                    run_mode = row.get("run_mode")
                    if run_mode:
                        project_run_mode = run_mode
                        break
                if project_run_mode:
                    break
            (
                expected_min_yield_per_sample,
                expected_min_yield_formula_mode,
            ) = self.get_expected_min_yield_per_sample(
                self.application,
                query,
                list(data.keys()),
                project_run_mode=project_run_mode,
            )

        # Check if any data is HiSeq X to mark in response
        is_hiseq_x = any(
            row.get("run_mode") == "HiSeq X"
            for sample_rows in data.values()
            for row in sample_rows
        )

        data["isHiseqX"] = is_hiseq_x
        data["expectedMinYieldPerSample"] = expected_min_yield_per_sample
        data["expectedMinYieldFormulaMode"] = expected_min_yield_formula_mode

        self.set_header("Content-type", "application/json")
        self.write(json.dumps(data))

    @staticmethod
    def get_total_reads(app, query):
        data = {}
        ordereddata = OrderedDict()
        sample_start_key = f"{query}_"
        sample_end_key = f"{query}_Z"

        # Get all flowcell info at once instead of per-row
        fc_info_view = app.cloudant.post_view(
            db="x_flowcells",
            ddoc="info",
            view="summary",
            descending=True,
        ).get_result()["rows"]
        fc_info_cache = {row["key"]: row["value"] for row in fc_info_view}

        xfc_view = app.cloudant.post_view(
            db="x_flowcells",
            ddoc="samples",
            view="lane_clusters",
            start_key=sample_start_key,
            end_key=sample_end_key,
            reduce=False,
        ).get_result()["rows"]

        for row in xfc_view:
            if row["key"] not in data:
                data[row["key"]] = []
            # To add correct threshold values
            fc_long_name = row["value"]["fcp"].split(":")[0]
            fc_parts = fc_long_name.split("_")
            fc_date_run = fc_parts[0][-6:]
            fc_short_name = fc_date_run + "_" + fc_parts[-1]
            if fc_short_name in fc_info_cache:
                info = fc_info_cache[fc_short_name]
                row["value"]["run_mode"] = info["run_mode"]
                row["value"]["longer_read_length"] = info["longer_read_length"]
            data[row["key"]].append(row["value"])

        # To check if sample is failed on lane level
        bioinfo_view = app.cloudant.post_view(
            db="bioinfo_analysis",
            ddoc="latest_data",
            view="sample_id",
            start_key=[sample_start_key, None, None, None],
            end_key=[sample_end_key, "ZZ", "ZZ", "ZZ"],
        ).get_result()["rows"]
        for row in bioinfo_view:
            if row["key"][3] in data:
                for fcl in data[row["key"][3]]:
                    if row["key"][1] + ":" + row["key"][2] == fcl["fcp"]:
                        fcl["sample_status"] = row["value"]["sample_status"]
                        break  # since the row is already found

        sample_view_rows = app.cloudant.post_view(
            db="projects",
            ddoc="project",
            view="samples",
            key=query,
        ).get_result()["rows"]

        samples_by_project = {
            row["key"]: row.get("value") or {} for row in sample_view_rows
        }
        project_sample_data = samples_by_project.get(query, {})

        for sample_name, sample_rows in data.items():
            sample_data = project_sample_data.get(sample_name, {})
            lib_qc_status = ReadTotalsDataHandler._sample_passed_library_qc(sample_data)
            for sample_row in sample_rows:
                sample_row["lib_qc"] = lib_qc_status

        for key in sorted(data.keys()):
            ordereddata[key] = sorted(data[key], key=lambda d: d["fcp"])
        return ordereddata

    @staticmethod
    def _sample_passed_library_qc(sample_data):
        if not sample_data:
            return "-"

        if "details" in sample_data and "passed_library_qc" in sample_data["details"]:
            return sample_data["details"]["passed_library_qc"]

        return "-"

    @staticmethod
    def _parse_units_ordered(value):
        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            normalized = value.strip().replace(",", ".")
            if not normalized:
                return None
            try:
                return float(normalized)
            except ValueError:
                return None

        return None

    @staticmethod
    def get_expected_min_yield_per_sample(
        app, query, sample_names, project_run_mode=None
    ):
        if not sample_names:
            return None, None

        project_rows = app.cloudant.post_view(
            db="projects",
            ddoc="project",
            view="project_id",
            key=query,
            include_docs=True,
        ).get_result()["rows"]
        if not project_rows:
            return None, None

        details = project_rows[0].get("doc", {}).get("details", {})
        flowcell_type = str(details.get("flowcell", "")).strip()

        sample_rows = app.cloudant.post_view(
            db="projects",
            ddoc="project",
            view="samples",
            key=query,
        ).get_result()["rows"]
        if not sample_rows:
            return None, None

        total_samples = len(sample_rows[0].get("value") or {})
        if total_samples == 0:
            return None, None
        sequencing_ordered = ReadTotalsDataHandler._parse_units_ordered(
            details.get("sequence_units_ordered_(lanes)")
        )
        if flowcell_type.startswith("Universal-"):
            if sequencing_ordered is None:
                return None, None

            return (
                sequencing_ordered
                * ReadTotalsDataHandler.UNIT_YIELD
                * ReadTotalsDataHandler.FLOWCELL_YIELD_FACTOR
                / total_samples
                * ReadTotalsDataHandler.SAMPLE_YIELD_FACTOR,
                "units",
            )

        # Prefer the run mode already loaded with the per-sample flowcell rows.
        run_mode = str(project_run_mode or "").strip()
        if not run_mode:
            # Fallback for projects where the run_mode was not attached to the rows.
            flowcell_name = str(
                details.get("flowcell_id") or details.get("flowcell") or ""
            ).strip()
            if not flowcell_name:
                return None, None

            flowcell_rows = app.cloudant.post_view(
                db="x_flowcells",
                ddoc="info",
                view="summary2_full_id",
                key=flowcell_name,
            ).get_result()["rows"]
            if not flowcell_rows:
                return None, None

            run_mode = str(
                flowcell_rows[0].get("value", {}).get("run_mode", "")
            ).strip()

        lane_threshold = thresholds.get(run_mode, 0)
        if lane_threshold <= 0:
            return None, None

        return (
            sequencing_ordered
            * lane_threshold
            * 1_000_000
            * ReadTotalsDataHandler.FLOWCELL_YIELD_FACTOR
            / total_samples
            * ReadTotalsDataHandler.SAMPLE_YIELD_FACTOR,
            "lanes",
        )


# Functions
def get_container_from_id(flowcell):
    if flowcell[7:].startswith("00000000"):
        # Miseq
        proc = lims.get_processes(
            type="MiSeq Run (MiSeq) 4.0", udf={"Flow Cell ID": flowcell[7:]}
        )[0]
        c = lims.get_containers(name=proc.udf["Reagent Cartridge ID"])[0]
    else:
        # NovaSeq (S1, S2, S4 and SP),HiSeq2500 (Illumina Flow Cell) and HiSeqX (Patterned Flow Cell)
        if lims.get_containers(
            name=flowcell[8:],
            type=["S1", "S2", "S4", "SP", "Illumina Flow Cell", "Patterned Flow Cell"],
        ):
            c = lims.get_containers(name=flowcell[8:])[0]
        else:
            try:
                # NextSeq500
                proc = lims.get_processes(
                    type="Illumina Sequencing (NextSeq) v1.0",
                    udf={"Flow Cell ID": flowcell[8:]},
                )[0]
            except IndexError:
                # NextSeq2000
                proc = lims.get_processes(
                    type="Illumina Sequencing (NextSeq) v1.0",
                    udf={"Flow Cell ID": flowcell.split("_")[1]},
                )[0]
            c = lims.get_containers(name=proc.udf["Reagent Cartridge ID"])[0]
    return c
