from status.util import SafeHandler, SafeSocketHandler
import random
import logging

class ProjectCardsHandler(SafeHandler):

    def get(self):
        t = self.application.loader.load("project_cards.html")

        self.write(
            t.generate(
                gs_globals=self.application.gs_globals,
                user=self.get_current_user(),
            )
        )

class ProjectCardsWebSocket(SafeSocketHandler):
    number = 2

    def open(self):
        # Create an infinite loop that sends a message every 5 seconds
        self.write_message(u"WebSocket opened")
        self.send_message()

        print("WebSocket opened")

    def on_message(self, number):

        # Check if the message is a number
        try:
            number = int(number)
        except ValueError:
            self.write_message(u"Please send a number")
            return
        ProjectStatusWebSocket.number = number

    def on_close(self):
        print("WebSocket closed")


    def send_message(self):

        # Check if connection is open
        if self.ws_connection is None:
            return

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        log = logging.getLogger(__name__)
        log.info("Sending message")
        # Create a list of number random numbers
        numbers = [str(random.random()) for i in range(ProjectStatusWebSocket.number)]

        self.write_message(u"Random numbers: " + ", ".join(numbers))
        self.application.ioloop.add_timeout(self.application.ioloop.time() + 5, self.send_message)