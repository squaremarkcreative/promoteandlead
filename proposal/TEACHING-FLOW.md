# Instructor reading and discussion flow

Source: the five user-supplied PDFs in `RBLP Material`. Source files remain unchanged. Content is organized by the 29 existing leader-task keys, with 87 reading/example/discussion sections and 263 question prompts. Each section records its source PDF and starting page. Extracted text normalizes Unicode ligatures and page line wrapping. Printed browser headers, footers, video embeds, diagrams, and assignment instructions are excluded from the guided discussions.

The instructor opens `#instructor/teaching`. One panel presents the core reading, the example, and the supplied questions in that order. Done & next records the current discussion and advances; finishing all discussions for a task marks that competency done. The last discussion opens a completion screen. Previous, the module menu, competency checklist, and numbered discussion controls allow revisiting material without losing completion.

Instructor position and discussion completion use separate `pl-proposal-teaching-position` and `pl-proposal-teaching-done` localStorage keys so student prep cannot move the instructor's place. Progress is local to this browser, with sample reset support in Review notes. Skipping directly to the end shows unfinished status with an action to resume the first unfinished discussion. No certificates are issued by completing this guide.

Crisp peaks is now the approved fixed hero artwork. Original artwork files are preserved.

Validation: JavaScript syntax; extraction checks for every task and complete reading/example/question groups; all 87 sequential next actions, backward navigation, final completion, unfinished recovery, persisted position and ten principal render routes passed in a Node DOM stub. Browser visual/interaction testing was not performed. This remains the local proposal, with no production backend change or deployment.
