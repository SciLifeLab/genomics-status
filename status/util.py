import tornado.web
import tornado.websocket
import json
import requests
import os
import sys
import urllib
from datetime import datetime, timedelta
from dateutil import parser


#########################
#  Useful misc handlers #
#########################

ERROR_CODES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Page Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    414: "Request-URI Too Long",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    511: "Network Authentication Required",
}


class User(object):
    """A minimal user class"""

    def __init__(self, name, email, roles):
        self.name = name
        self.email = email
        self.roles = roles

    @property
    def is_admin(self):
        return "admin" in self.roles

    @property
    def is_pricing_admin(self):
        return "pricing_admin" in self.roles

    @property
    def is_sample_requirements_admin(self):
        return "sample_requirements_admin" in self.roles

    @property
    def is_any_admin(self):
        return (
            self.is_admin
            or self.is_pricing_admin
            or self.is_sample_requirements_admin
        )

    @property
    def is_proj_coord(self):
        return "proj_coord" in self.roles


class BaseHandler(tornado.web.RequestHandler):
    """Base Handler. Handlers should not inherit from this
    class directly but from either SafeHandler or UnsafeHandler
    to make security status explicit.

    """

    def get(self):
        """The GET method on this handler will be overwritten by all other handler.

        As it is the default handler used to match any request that is not mapped
        in the main app, a 404 error will be raised in that case (because the get method
        won't be overwritten in that case)
        """
        raise tornado.web.HTTPError(404, reason="Page not found")

    def get_current_user(self):
        # Disables authentication if test mode to ease integration testing
        if self.application.test_mode:
            name = "Testing User!"
            roles = [
                "admin",
                "pricing_admin",
                "sample_requirements_admin",
                "proj_coord",
            ]
            email = "Testing User!"
        else:
            name = (
                str(self.get_secure_cookie("user"), "utf-8")
                if self.get_secure_cookie("user")
                else None
            )
            # Fix ridiculous bug with quotation marks showing on the web
            if name:
                if (name[0] == '"') and (name[-1] == '"'):
                    name = name[1:-1]
            roles = (
                json.loads(str(self.get_secure_cookie("roles"), "utf-8"))
                if self.get_secure_cookie("roles")
                else ["user"]
            )
            email = (
                str(self.get_secure_cookie("email"), "utf-8")
                if self.get_secure_cookie("email")
                else None
            )
        user = User(name, email, roles)
        if user.name:
            return user
        else:
            return None

    def write_error(self, status_code, **kwargs):
        """Overwrites write_error method to have custom error pages.

        http://tornado.readthedocs.org/en/latest/web.html#tornado.web.RequestHandler.write_error
        """
        reason = "Unknown Error"

        # Get information about the triggered exception
        self.application.gs_globals["exception_fulltext"] = repr(sys.exc_info())

        # Get the status code and error reason
        if status_code in list(ERROR_CODES):
            reason = ERROR_CODES[status_code]
        try:
            if "exc_info" in kwargs:
                _, error, _ = kwargs["exc_info"]
                reason = error.reason
        except AttributeError:
            pass

        # Return JSON if this is an API call
        if "/api/v1/" in self.request.uri:
            jsondict = {
                "page_title": "Error {}: {}".format(status_code, reason),
                "error_status": status_code,
                "error_reason": reason,
                "error_exception": self.application.gs_globals["exception_fulltext"],
            }
            self.set_header("Content-type", "application/json")
            self.write(json.dumps(jsondict))

        # Render the error template
        else:
            t = self.application.loader.load("error_page.html")
            self.write(
                t.generate(
                    gs_globals=self.application.gs_globals,
                    status=status_code,
                    reason=reason,
                    user=self.get_current_user(),
                )
            )

    def get_multiqc(self, project_id, read_file=True):
        """
        Getting multiqc reports for requested project from the filesystem
        Returns a string containing html if report exists, otherwise None
        If read_file is false, the value of the dictionary will be the path to the file
        """
        view = self.application.projects_db.view("project/id_name_dates")
        rows = view[project_id].rows
        project_name = ""
        multiqc_reports = {}
        # get only the first one
        for row in rows:
            project_name = row.value.get("project_name", "")
            break

        if project_name:
            multiqc_path = self.application.multiqc_path or ""
            for type in ["_", "_qc_", "_pipeline_"]:
                multiqc_name = "{}{}multiqc_report.html".format(project_name, type)
                multiqc_file_path = os.path.join(multiqc_path, multiqc_name)
                if os.path.exists(multiqc_file_path):
                    if read_file:
                        with open(multiqc_file_path, "r", encoding="utf-8") as multiqc_file:
                            html = multiqc_file.read()
                            multiqc_reports[type] = html
                    else:
                        multiqc_reports[type] = multiqc_file_path
        return multiqc_reports

    @staticmethod
    def get_user_details(app, user_email):
        user_details = {}
        if user_email == "Testing User!":
            user_email = app.settings.get("username", None) + "@scilifelab.se"
            user_details = {
                "userpreset": {"Hardcoded One": {}}
            }  # Just to show something locally
        rows = app.gs_users_db.view("authorized/users", include_docs=True)[
            user_email
        ].rows
        if len(rows) == 1:
            user_details = dict(rows[0].doc)

        return user_details


class SafeHandler(BaseHandler):
    """All handlers that need authentication and authorization should inherit
    from this class.
    """

    @tornado.web.authenticated
    def prepare(self):
        """This method is called before any other method.

        Having the decorator @tornado.web.authenticated here implies that all
        the Handlers that inherit from this one are going to require
        authentication in all their methods.
        """
        pass


class UnsafeHandler(BaseHandler):
    pass


class SafeSocketHandler(tornado.websocket.WebSocketHandler, SafeHandler):
    @tornado.web.authenticated
    def prepare(self):
        return super(tornado.websocket.WebSocketHandler, self).prepare()

    def get_current_user(self):
        return super(SafeHandler, self).get_current_user()

    def check_origin(self, origin):
        parsed_origin = urllib.parse.urlparse(origin)
        if self.application.test_mode:
            return True
        return parsed_origin.netloc.endswith(".scilifelab.se")


class MainHandler(UnsafeHandler):
    """Serves the html front page upon request."""

    def get(self):
        t = self.application.loader.load("index.html")
        user = self.get_current_user()
        # Avoids pulling all historic data by assuming we have less than 30 NAS:es
        view = self.application.server_status_db.view(
            "nases/by_timestamp", descending=True, limit=30
        )
        latest = max([parser.parse(row.key) for row in view.rows])
        # assuming that status db is not being updated more often than every 5 minutes
        reduced_rows = [
            row
            for row in view.rows
            if latest - parser.parse(row.key) <= timedelta(minutes=5)
        ]
        instruments = self.application.server_status["instruments"]
        server_status = {}
        for row in reduced_rows:
            server = row.value.get("name")
            if server is None:
                continue
            if server not in server_status:
                server_status[server] = row.value
                server_status[server]["instrument"] = instruments.get(server, "-")
                used_percentage = float(
                    row.value.get("used_percentage", "0").replace("%", "")
                )
                if used_percentage > 60:
                    server_status[server]["css_class"] = "q-warning"
                elif used_percentage > 80:
                    server_status[server]["css_class"] = "q-danger"
                else:
                    server_status[server]["css_class"] = ""
        # sort by used space
        server_status = sorted(
            server_status.items(),
            key=lambda item: item[1].get("used_percentage"),
            reverse=True,
        )
        # Load presets to populate the projects links
        presets_list = self.get_argument("presets_list", "pv_presets")
        presets = {}
        if self.get_current_user():
            user_details = self.get_user_details(
                self.application, self.get_current_user().email
            )
            presets = {
                "default": self.application.genstat_defaults.get(presets_list),
                "user": user_details.get("userpreset"),
            }

        self.write(
            t.generate(
                gs_globals=self.application.gs_globals,
                user=user,
                server_status=server_status,
                presets=presets,
            )
        )


def dthandler(obj):
    """ISO formatting for datetime to be used in JSON."""
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    else:
        raise TypeError("Object can not be isoformatted.")


################################
# Useful data-serving handlers #
################################


class DataHandler(UnsafeHandler):
    """Serves a listing of all available URL's in the web service."""

    def get(self):
        self.set_header("Content-type", "application/json")
        handlers = []
        for h in self.application.declared_handlers:
            try:
                handlers.append(h[0])
            except TypeError:  # 'URLSpec' object does not support indexing
                handlers.append(h.regex.pattern)
        api = [h for h in handlers if h.startswith("/api")]
        utils = [h for h in handlers if h == "/login" or h == "/logout" or h == ".*"]
        pages = list(set(handlers).difference(set(api)).difference(set(utils)))
        pages = [h for h in pages if not (h.endswith("?") or h.endswith("$"))]
        pages.sort(reverse=True)
        api.sort(reverse=True)
        self.write(json.dumps({"api": api, "pages": pages}))


class UpdatedDocumentsDatahandler(SafeHandler):
    """Serves a list of references to the last updated documents in the
    databases Status gets data from.

    Specify to get the <n> latest items by ?items=<n>.

    Loaded through /api/v1/last_updated
    """

    def get(self):
        num_items = int(self.get_argument("items", 25))
        self.set_header("Content-type", "application/json")
        self.write(json.dumps(self.list_updated(num_items)))

    def list_updated(self, num_items=25):
        last = []

        view = self.application.projects_db.view(
            "time/last_updated", limit=num_items, descending=True
        )
        for doc in view:
            last.append((doc.key, doc.value, "Project information"))

        view = self.application.flowcells_db.view(
            "time/last_updated", limit=num_items, descending=True
        )
        for doc in view:
            last.append((doc.key, doc.value, "Flowcell information"))

        last = sorted(last, key=lambda tr: tr[0], reverse=True)
        return last[:num_items]


class NoCacheStaticFileHandler(tornado.web.StaticFileHandler):
    """Serves up static files without any tornado caching.
    https://gist.github.com/omarish/5499385
    """

    def set_extra_headers(self, path):
        self.set_header("Cache-control", "no-cache")


class LastPSULRunHandler(SafeHandler):
    """Gives the date of the last PSUL run, assumin the logfile is where we expect it"""

    def get(self):
        logfile = self.application.psul_log
        response = {}
        try:
            text_timestamp = os.stat(logfile).st_mtime
            delta = datetime.now() - datetime.fromtimestamp(int(text_timestamp))
        except (OSError, KeyError, TypeError):
            response["status"] = "Log File '{}' not found.".format(logfile)
        else:
            response["status"] = "Success"
            response["hours"] = int(delta.seconds / 3600)
            response["minutes"] = int((delta.seconds % 3600) / 60)
            response["seconds"] = int(delta.seconds % 60)

        self.set_header("Content-type", "application/json")
        self.write(json.dumps(response))


########################
# Other useful classes #
########################


class GoogleUser(object):
    """Stores the information that google returns from a user throuhgh its secured API."""

    def __init__(self, user_token):
        assert "access_token" in user_token

        self.user_token = user_token
        self._google_plus_api = "https://www.googleapis.com/plus/v1/people/me"

        # Fetch actual information from Google API
        params = {"access_token": self.user_token.get("access_token")}
        r = requests.get(self._google_plus_api, params=params)
        if not r.status_code == requests.status_codes.codes.OK:
            self.authenticated = False
        else:
            self.authenticated = True
            info = json.loads(r.text)
            self.display_name = info.get("displayName", "")
            self.emails = [email["value"] for email in info.get("emails")]

    def is_authorized(self, user_view):
        """Checks that the user is actually authorised to use genomics-status."""
        authenticated = False
        for email in self.emails:
            if user_view[email]:
                self.valid_email = email
                authenticated = True
        return authenticated
