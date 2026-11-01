+++
title = "NextPad · Etherpad alternative for teaching, Moodle and ILIAS"
description = "Write together in seminars and lectures: pad with timeline, idea collection, quiz and drawing board. No account for participants, data on your own server."

[extra]
kicker = "For teaching · free software (EUPL-1.2)"
h1 = "Writing together in seminars and lectures"
lead = "Groups write in the same text, the plenary collects questions and votes, teams compete in a quiz. Participants need no account, a link or QR code is enough, on desktop and mobile devices. The data stays on the institution’s server."
facts = ["no account for participants", "on desktop and mobile devices", "data stays on your own server", "on its own or in Moodle and ILIAS", "German and English"]
hero_alt = "A pad in the browser: heading “Audio-Feature: Klang des Campus”, a task list for Lea, Jonas and Mira, Jonas’ new sentence marked in colour."

lehre_title = "Using it in teaching"
lehre_text = "Pads are mainly tools for in-class and seminar phases: groups work at the same time, teachers see what emerges. On top come a projector view with QR code, votes and a buzzer on the phone. Which tool suits which situation is shown in the <a href=\"manual/scenarios/\">manual</a>."
szenarien = [
  { tool = "Pad", title = "Group work in class", text = "Three to six students write in the same text. In Moodle group mode every group gets its own pad." },
  { tool = "Author colours", title = "Making participation visible", text = "Every person writes in their own colour. The group sees who contributed, without anything being graded." },
  { tool = "Thumbs", title = "Opinion poll in the text", text = "Thumbs up or down right next to a statement or proposal, one vote per person. An opinion poll right inside the text." },
  { tool = "Task list", title = "Ticking off assignments", text = "Checkboxes typed as <code>- [ ]</code> or added by button. Everyone sees live what is done." },
  { tool = "Timeline", title = "Reflecting on writing", text = "The timeline shows how a text came about: what was deleted, when the turn came. Suited to tasks such as “Compare the first draft with the result”." },
  { tool = "Idea collection", title = "Questions from the plenary", text = "Even in large groups, questions and ideas come together, without names, with one vote per person. The board view shows the result live." },
  { tool = "Quiz", title = "Revision as a quiz", text = "At the end of a unit, teams compete on the quiz grid and buzz with their phones. Teams only have names, no individuals are recorded." },
  { tool = "Drawing board", title = "Storyboard and mind map", text = "Storyboards, mind maps or flow charts are created together on the drawing board, on the same server." },
]

why_title = "Why NextPad and not Etherpad?"
why_text = "Etherpad made writing together in the browser known at universities, often through <code>mod_etherpadlite</code> in Moodle. NextPad keeps what teaching uses. What makes it hard to run, it leaves out."
why = [
  { big = "Same", title = "for teachers in Moodle and ILIAS", text = "In Moodle the “Etherpad Lite” activity stays as it is: groups, time windows, course backup and restore keep working. In ILIAS NextPad comes into the course as an external tool. Existing pads stay available." },
  { big = "More", title = "tools for the room", text = "Timeline to trace changes, idea collection with board view, quiz with buzzer and drawing board, all on one server. The chat is gone; it was hardly used." },
  { big = "Easier", title = "to run", text = "One program instead of a Node server with over a thousand npm packages and plugins. An update means: replace one file. Even with 100 people in one pad, responses stay under 80 ms in the load test." },
]

feat_title = "What is inside"
feat_text = "The pad is at the core. Idea collection, quiz and drawing board come on top and can be switched on and off per server. Everything runs without a learning platform and on phones too."

moodle_title = "With Moodle and ILIAS"
moodle_text = "In Moodle and ILIAS, pad, idea collection and quiz come into the course as an activity. Then only course members take part, and teachers moderate. The manual shows how for <a href=\"manual/moodle/\">Moodle</a> and <a href=\"manual/ilias/\">ILIAS</a>. Moodle needs no new plugin for this."
steps = [
  { title = "Enter server and key", text = "Set the NextPad address and the API key in the Etherpad Lite plugin. Nothing else changes in Moodle." },
  { title = "Keep working as before", text = "Moodle creates pads, authors and sessions itself through the API. Group mode, course reset, backup and restore use the same calls as with Etherpad." },
  { title = "Optional: LTI 1.3", text = "Added as an “External tool”, each activity becomes its own pad, idea collection or quiz. Roles come from Moodle: teachers moderate and lead, students take part. Names, profile pictures and language are passed on, a button leads back to the course. NextPad does not send grades." },
]
moodle_name = "Moodle"
moodle_how = "via the Etherpad API and LTI 1.3"
ilias = { name = "ILIAS", status = "tested with ILIAS 11", text = "The administration registers NextPad once as an LTI provider. Teachers then add a pad, idea collection or quiz to the course as an object. Roles, names and language come from ILIAS. From version 0.19 on, the QR code and “Back to course” lead to ILIAS." }
api_label = "Example of an API call"
api_c1 = "This is how mod_etherpadlite asks, NextPad answers like Etherpad"
api_c2 = "Response"
api_caption = "The API is described in <code>docs/api-spezifikation.md</code> (German)."

themes_title = "Three looks"
themes_text = "One setting picks the shape for the start page, pads, idea collection and quiz: square, slightly rounded or rounded. All three meet WCAG 2.2 AA in light and dark mode. The fonts ship with the program and never come from other servers."
themes = [
  { name = "Square", wert = "nextpad", standard = true, text = "Clear edges, petrol as accent, the font NextPad Sans with the metrics of Arial. Logo and house colours can be set in the admin pages.", alt = "Start page in the square look: header with the NextPad mark, field for the pad name, petrol button, templates as tiles with straight corners." },
  { name = "Rounded", wert = "rund", text = "Large radii, pill buttons, blue as accent. The font Lexend was designed for readability. Logo and house colours can be set in the admin pages.", alt = "Start page in the rounded look: light blue background, card with large radii, blue pill button, font Lexend." },
  { name = "Slightly rounded", wert = "colibris", text = "Like Etherpad with Quicksand and the pencil background. Familiar to everyone who worked with Etherpad before.", alt = "Start page in the slightly rounded look: green background with coloured pencils, dark panel with “New pad” and a field for the name." },
]
themes_hint = "The variable <code>NEXTPAD_THEME</code> picks the look, on YunoHost the installation does. Institutions with their own corporate design use the <code>hsd</code> look as a template."

ops_kicker = "For operation"
ops_title = "Privacy, operation, accessibility"
ops_text = "This part is for everyone who runs NextPad at their institution or decides about it."
cards = [
  { title = "No third-party services", text = "No trackers, no fonts or scripts from others. Everything the browser loads comes from your own server." },
  { title = "Deleting own pads", text = "Whoever creates a free pad owns it and can delete it or extend it by a year at any time. If wanted, NextPad deletes unused pads after an adjustable period; it is off by default. People signed in through Moodle or ILIAS get an email with the content first. Pads in courses follow the course." },
  { title = "Small attack surface", text = "One program without Node.js and without runtime plugins. Pad content stays data, sign-in through Moodle only accepts RS256-signed tokens." },
  { title = "Technology", text = "One program in Rust with SQLite. Collaborative writing with Yjs (CRDT) and the TipTap editor; the drawing board is Excalidraw over the same Yjs server." },
  { title = "Easy to run", text = "SQLite in the data directory, configuration through environment variables. A reverse proxy with TLS in front, done." },
  { title = "Accessibility checked", text = "Start page and idea collection are checked with axe against WCAG 2.2 AA in every look, light and dark, on every test run. Targets are at least 44 px. Limits: the drawing board is hardly usable with screen readers, and the buzzer requires quick reactions." },
  { title = "Two languages", text = "Interface, help, exports and emails in German and English. The choice is remembered, otherwise the language from Moodle or the browser applies. What people write stays as it is." },
]

inst_title = "Install"
inst_text = "Three ways, depending on your environment. The settings are described in <a href=\"https://github.com/NextPad/NextPad/blob/main/server/README.md\"><code>server/README.md</code></a>."
ways = [
  { title = "Binary", text = "Download for Linux x86-64 from the releases and start it.", code = "<span class=\"c\"># data directory and address</span>\nNEXTPAD_DATA=/srv/nextpad \\\nNEXTPAD_PUBLIC_URL=https://pads.example.org \\\n./nextpad", link = "releases/latest", link_text = "Go to releases" },
  { title = "Container", text = "With docker compose following linuxserver.io, data under <code>./config</code>.", code = "cp .env.example .env\ndocker compose up -d --build", link = "blob/main/docs/docker.md", link_text = "Container guide" },
  { title = "YunoHost", text = "As an app with a settings page for API keys, LTI and admins.", code = "yunohost app install \\\n  ./packaging/nextpad_ynh", link = "tree/main/packaging/nextpad_ynh", link_text = "YunoHost package" },
]

[[extra.features]]
tag = "Start page"
title = "Start right away, no learning platform needed"
text = ["Type a name on the start page or pick a template, and a pad, collection, quiz or drawing board is ready. Share it by link or QR code. Free pads have ownership rules and an adjustable retention period. Light and dark follow the system.", "Admins set name, colours, logo and start image in the browser. NextPad computes the colour shades so that the contrast is sufficient."]
imgs = [
  { src = "start.webp", cls = "pic-light", w = 1600, h = 1000, alt = "NextPad start page with an input field for a pad name and templates." },
  { src = "start-dunkel.webp", cls = "pic-dark", w = 1600, h = 1000, alt = "NextPad start page in dark mode." },
]

[[extra.features]]
tag = "Pad"
title = "Writing with a timeline"
text = ["Everyone writes in the same text at the same time, each person in their own colour. The timeline replays how the text came about step by step."]
items = ["Markdown while typing and pasting: <code>#</code> for headings, <code>-</code> for lists, <code>- [ ]</code> for checkboxes, tables with <code>|</code>", "Thumbs up and down in the text, one vote per person", "Table of contents in the margin or as a block in the text", "Timeline with time and author per step, restore an earlier version", "Export as HTML, Markdown, text and PDF"]
imgs = [{ src = "zeitleiste.webp", w = 1600, h = 1000, alt = "Timeline above the pad: the slider is just before the end, Jonas’ sentence is only half written." }]

[[extra.features]]
tag = "Idea collection"
title = "Collect questions and ideas, vote, show"
text = ["Post without a name, vote with one vote per person. The board view with QR code goes on the projector, moderated by the person who created the collection."]
imgs = [
  { src = "ideen.webp", w = 1600, h = 1748, alt = "Idea collection with the question “Welche Themen soll das Campusradio im nächsten Semester aufgreifen?” (topics for the campus radio) and five ideas sorted by votes." },
  { src = "leinwand.webp", w = 1600, h = 900, alt = "Board view of the same collection with a large QR code for joining." },
]

[[extra.features]]
tag = "Quiz"
title = "Quiz grid with buzzer"
text = ["Enter questions by category and points as a table, put the grid on the projector, teams buzz with their phones. Whoever presses first appears large on the screen, a countdown limits the time per question."]
items = ["Teams join by QR code; start, end and restart the game", "Buzzer measurement checks in the room how fast each phone transmits signal and press", "As an activity in Moodle and ILIAS via LTI 1.3"]
board = true

[[extra.features]]
tag = "Drawing board"
title = "Sketch on the same server"
text = ["Shapes, arrows, freehand and text on a shared surface. Everyone sees the others' pointers. The drawing board is hardly usable with screen readers; the pad suits that better."]
imgs = [{ src = "zeichenbrett.webp", w = 1600, h = 1000, alt = "Drawing board with a storyboard: rectangle “Szene 1: Totale”, arrow, ellipse “Szene 2: Interview”." }]

[extra.board]
label = "Example of a quiz grid: four categories with questions for 100, 200 and 300 points, three fields played, one question open, team Blue buzzed first."
cats = ["Camera", "Sound", "Editing", "Media law"]
done = [0, 2, 5]
now = 6
team1 = "Team Blue"
team2 = "Team Yellow"
buzz = "Team Blue was first"
+++
