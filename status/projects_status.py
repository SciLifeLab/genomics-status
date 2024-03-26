from status.util import SafeHandler

class ProjectsStatusHandler(SafeHandler):

    def get(self):
        t = self.application.loader.load("projects_status.html")
        self.write(
            t.generate(
                gs_globals=self.application.gs_globals,
                user=self.get_current_user(),
            )
        )