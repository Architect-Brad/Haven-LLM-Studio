#!/usr/bin/env python3
"""
Haven LLM Studio KRunner Plugin
Allows querying Haven LLM directly from KRunner (Alt+F2)

Installation:
  cp haven-krunner.py ~/.local/share/krunner/dbusplugins/
  qdbus org.kde.KRunner /KRunner loadPlugins

Usage:
  Alt+F2 → "ask haven <your question>"
"""

import json
import subprocess
import sys
from dbus.service import method, Object, BusName
from dbus import SessionBus
from gi.repository import GObject

BUS_NAME = 'org.kde.krunner.HavenLLM'
BUS_PATH = '/HavenLLM'

SERVER_URL = 'http://127.0.0.1:1234'


class HavenKRunnerPlugin(Object):
    """KRunner plugin for Haven LLM Studio"""

    def __init__(self):
        bus = SessionBus()
        bus_name = BusName(BUS_NAME, bus=bus)
        super().__init__(bus_name, BUS_PATH)

    @method(dbus_interface='org.kde.krunner1.Runner',
            in_signature='s', out_signature='a(ossa{sv})')
    def Match(self, query):
        """Match queries starting with 'ask haven' or 'haven'"""
        results = []

        if not query.lower().startswith(('ask haven', 'haven')):
            return results

        # Extract the actual question
        if query.lower().startswith('ask haven'):
            question = query[11:].strip()
        else:
            question = query[6:].strip()

        if not question:
            return results

        results.append((
            'haven-ask',  # ID
            f'Ask Haven LLM: {question}',  # Text
            'Query Haven LLM Studio',  # Subtext
            'haven-llm-studio',  # Icon
            100,  # Relevance
            {}  # Actions
        ))

        return results

    @method(dbus_interface='org.kde.krunner1.Runner',
            in_signature='ss', out_signature='')
    def Run(self, match_id, action_id):
        """Execute the query when user selects the result"""
        if match_id != 'haven-ask':
            return

        # Get the query from Match (simplified — in production, store it)
        self._show_notification('Haven LLM', 'Processing your query...')

    @method(dbus_interface='org.kde.krunner1.Runner',
            in_signature='s', out_signature='a(ossa{sv})')
    def RunSingle(self, query):
        """Run a single match"""
        return self.Match(query)

    def _show_notification(self, title, message):
        """Show a desktop notification"""
        try:
            subprocess.run([
                'notify-send',
                '-i', 'haven-llm-studio',
                title,
                message
            ], check=False)
        except Exception:
            pass


if __name__ == '__main__':
    import dbus
    import dbus.service
    import dbus.mainloop.glib
    from gi.repository import GLib

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    plugin = HavenKRunnerPlugin()
    loop = GLib.MainLoop()
    loop.run()
