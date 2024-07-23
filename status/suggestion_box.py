from collections import OrderedDict
from datetime import datetime

from atlassian import Jira
from status.util import SafeHandler

TITLE_TEMPLATE = "{title} ({area})"

DESCRIPTION_TEMPLATE = """
* Created on: {date}
* Area: {area}
* System: {system}
* Importance: {importance}
* Difficulty: {difficulty}
* Reporter: {user}

*Description*
{description}

*Suggestion*
{suggestion}
"""


class SuggestionBoxHandler(SafeHandler):
    """Handles URL /suggestion_box"""

    def get(self):
        """Returns the Suggestion Box HTML template, as it is"""
        t = self.application.loader.load("suggestion_box.html")
        self.write(
            t.generate(
                gs_globals=self.application.gs_globals, user=self.get_current_user()
            )
        )

    def post(self):
        """Collect data from the HTML form to fill in a Jira card.

        That card will be uploaded to the Suggestion Box status on the Stockholm developers project
        """
        # Get form data
        date = datetime.now()
        title = self.get_argument("title")
        area = self.get_argument("area")
        system = self.get_argument("system")
        importance = self.get_argument("importance")
        difficulty = self.get_argument("difficulty")
        user = self.get_current_user()
        description = self.get_argument("description")
        suggestion = self.get_argument("suggestion")

        jira = Jira(
             url=self.application.jira_url, 
             username=self.application.jira_user, 
             password=self.application.jira_api_token
        )

        summary = TITLE_TEMPLATE.format(title=title, area=area)
        description = DESCRIPTION_TEMPLATE.format(
                    date=date.ctime(),
                    area=area,
                    system=system,
                    importance=importance,
                    difficulty=difficulty,
                    user=user.name,
                    description=description,
                    suggestion=suggestion,
                )
        new_card = jira.issue_create(
            fields={
                "project": {"key": self.application.jira_project_key},
                "summary": summary,
                "description": description,
                "issuetype": {"name": "Task"},
            }
        )

        # Save the information of the card in the database
        self.application.suggestions_db.create(
            {
                "date": date.isoformat(),
                "card_id": new_card.get('id'),
                "description": description,
                "name": summary,
                "url": f"{self.application.jira_url}/jira/core/projects/{self.application.jira_project_key}/board?selectedIssue={new_card.get('key')}",
                "archived": False,
                "source": "jira",
            }
        )

        self.set_status(200)


class SuggestionBoxDataHandler(SafeHandler):
    """Handles URL /api/v1/suggestions"""

    def get(self):
        view = self.application.suggestions_db.view("date/info")
        self.set_header("Content-type", "application/json")
        suggestions = OrderedDict()
        for row in sorted(view.rows, key=lambda x: x.key, reverse=True):
            suggestions[row.key] = row.value
        self.write(suggestions)
