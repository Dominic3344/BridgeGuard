BridgeGuard — River Link Bridge (KL-001) Structural Health Monitoring Demo
===========================================================================

WHAT THIS IS
------------
A self-contained, front-end-only prototype dashboard for a competition
presentation. It simulates what an IoT-based structural health monitoring
and early-warning system for an aging bridge could look like.

ALL SENSOR DATA IN THIS DEMO IS SIMULATED. No real sensors, hardware, or
bridges are connected. Nothing here should be used, or read, as an actual
structural safety assessment.


HOW TO RUN IT
-------------
1. Unzip BridgeGuard_Demo_Website.zip anywhere on your computer.
2. Open the file "index.html" in Chrome or Edge (double-click it, or
   right-click -> Open with -> Chrome/Edge).
3. That's it. No installation, no server, and no internet connection is
   required for the simulation to run. (An internet connection only
   improves the on-screen fonts slightly; the dashboard works fully
   offline either way.)

For the smoothest experience during a live presentation, open the file in
its own browser window and use "Presentation Mode" (top right) to hide the
scenario controls and enlarge the key readouts.


WHAT'S INSIDE
-------------
index.html   Page structure and all five dashboard tabs
style.css    Dark, engineering-style visual design
script.js    Simulation engine: sensor model, scenarios, health scoring,
             anomaly-fusion classification, live chart, alerts & timeline
README.txt   This file


HOW TO DEMO IT
--------------
Use the "Scenario Simulator" buttons in the left sidebar to change the
simulated sensor readings instantly:

  Normal Operation      All five sensors sit within baseline ranges.
  Heavy Vehicle Event    Temporary spike in load, vibration and deck tilt,
                          then automatically returns to normal after ~14s.
  High Vibration         ACC-DECK-01 spikes and triggers a WARNING.
  Pier Tilt              TILT-PIER-03 spikes and triggers a WARNING.
  Structural Anomaly     Several sensors move together — demonstrates the
                          "correlated deviation" / bridge-anomaly case.
  Sensor Failure         ACC-DECK-01 goes OFFLINE. Its card switches to an
                          ESTIMATED value with a confidence percentage and
                          a "recommend physical inspection" note, while the
                          other four sensors stay normal — this is the demo
                          of an isolated sensor fault, as distinct from a
                          real structural anomaly.
  Critical Event         Multiple independent sensors go abnormal at once;
                          health score drops and status becomes
                          INSPECTION REQUIRED.

"Reset" returns everything to Normal Operation and clears the event log.
"Presentation Mode" hides the scenario controls for a cleaner on-screen
look while you narrate.

The five tabs:
  Dashboard        Health score, live sensor cards, live trend chart,
                   active alerts, monitoring pipeline.
  Bridge View      Clickable schematic of the bridge showing where each
                   sensor sits; select a marker to see its live reading.
  Analytics        Baseline deviation and confidence per sensor, plus the
                   anomaly-fusion logic that tells sensor faults apart
                   from genuine structural signals.
  Material Health  Illustrative NDT/inspection demo records (Rebound
                   Hammer, UPV, corrosion assessment, visual inspection).
                   Clearly labelled as demo data, not real measurements.
  Alerts           Chronological event timeline, with an "Export Demo
                   JSON" button that downloads the current simulated
                   state as a .json file.


IMPORTANT WORDING NOTE
-----------------------
This prototype deliberately avoids claiming to predict bridge collapse or
to certify that a bridge is safe. It uses "early warning", "anomaly
detection", "inspection required" and "inspection prioritisation" —
language appropriate for a decision-support and monitoring tool, not a
safety guarantee. The intended real-world pipeline this prototype
illustrates is:

  ESP32 + Sensors -> Communication -> Analytics -> Dashboard -> Early Warning


BROWSER SUPPORT
----------------
Tested for Chrome and Edge (latest versions). Any modern Chromium-based
or Firefox browser should also work, since the whole thing is plain
HTML/CSS/JavaScript with no build step and no external dependencies
beyond an optional web font.
