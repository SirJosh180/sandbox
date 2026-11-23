// The six SandBox paths. A student's assigned path decides which modules,
// tools, panel and colour their portal shows. Edit this file to change the curriculum.
// Module ids must stay stable once students start ticking them off.

const PATHS = {
  pm: {
    id: 'pm', code: 'PM', name: 'Project Manager',
    accent: '#f4cf82', accentInk: '#10141b',
    mission: 'Keep the team shipping the right thing, sprint after sprint.',
    tools: ['Jira or Trello', 'Notion', 'Google Calendar', 'Slack or Discord'],
    panel: {
      title: 'Your sprint rituals', kind: 'rituals',
      items: [
        { label: 'Sprint planning', detail: 'Start of each sprint. You run it: pick goals, size tickets, confirm owners.' },
        { label: 'Stand-up', detail: '10 minutes, 2–3 times a week. Done, doing, blocked.' },
        { label: 'Client check-in', detail: 'Weekly. Bring a demo and the questions the team needs answered.' },
        { label: 'Retro', detail: 'End of each sprint. One thing to keep, one to change.' },
      ],
    },
    modules: [
      { id: 'pm-1', week: 1, title: 'Writing a project brief', desc: 'Turn the client’s idea into goals, users and scope.', deliverable: 'One-page brief' },
      { id: 'pm-2', week: 2, title: 'User stories and the backlog', desc: 'Break the brief into stories with acceptance criteria.', deliverable: 'Groomed backlog' },
      { id: 'pm-3', week: 3, title: 'Running sprint planning', desc: 'Estimate, prioritise and commit as a team.', deliverable: 'Sprint 1 plan' },
      { id: 'pm-4', week: 5, title: 'Unblocking the team', desc: 'Spot risks early and clear blockers fast.', deliverable: 'Risk log' },
      { id: 'pm-5', week: 8, title: 'Demo day storytelling', desc: 'Present what was built and why it matters.', deliverable: 'Demo script' },
    ],
  },
  uiux: {
    id: 'uiux', code: 'UI/UX', name: 'UI/UX Designer',
    accent: '#c4a7ff', accentInk: '#10141b',
    mission: 'Make the product make sense to the people who use it.',
    tools: ['Figma', 'FigJam', 'Maze or Google Forms', 'Material / HIG guidelines'],
    panel: {
      title: 'Your design checklist', kind: 'checklist',
      items: [
        { label: 'Talked to at least 3 real users' },
        { label: 'Flows mapped before screens' },
        { label: 'Colour contrast passes WCAG AA' },
        { label: 'Every screen has empty, loading and error states' },
        { label: 'Handed off with spacing and components named' },
      ],
    },
    modules: [
      { id: 'ux-1', week: 1, title: 'User interviews', desc: 'Plan and run short interviews, then pull out insights.', deliverable: 'Interview notes' },
      { id: 'ux-2', week: 2, title: 'User flows and wireframes', desc: 'Sketch the main journeys in low fidelity.', deliverable: 'Wireframes' },
      { id: 'ux-3', week: 4, title: 'Design systems basics', desc: 'Type, colour, spacing and reusable components.', deliverable: 'Mini style guide' },
      { id: 'ux-4', week: 5, title: 'Prototyping and testing', desc: 'Build a clickable prototype and test it with users.', deliverable: 'Usability findings' },
      { id: 'ux-5', week: 7, title: 'Developer handoff', desc: 'Annotate designs so developers build them right.', deliverable: 'Handoff file' },
    ],
  },
  fe: {
    id: 'fe', code: 'FE', name: 'Frontend Developer',
    accent: '#7cc4ff', accentInk: '#10141b',
    mission: 'Build the screens people actually touch, fast and accessible.',
    tools: ['VS Code', 'HTML, CSS, JavaScript', 'React', 'Chrome DevTools', 'Git'],
    panel: {
      title: 'Definition of done (frontend)', kind: 'checklist',
      items: [
        { label: 'Matches the design at phone and desktop widths' },
        { label: 'Works with keyboard only' },
        { label: 'Handles loading and error states' },
        { label: 'No console errors' },
        { label: 'Pull request reviewed by a teammate' },
      ],
    },
    modules: [
      { id: 'fe-1', week: 1, title: 'Git and pull requests', desc: 'Branch, commit, open a PR and respond to review.', deliverable: 'First merged PR' },
      { id: 'fe-2', week: 2, title: 'Responsive layouts', desc: 'Flexbox, grid and mobile-first CSS.', deliverable: 'Responsive page' },
      { id: 'fe-3', week: 3, title: 'Components and state', desc: 'Build reusable components in React.', deliverable: 'Component library' },
      { id: 'fe-4', week: 5, title: 'Talking to the API', desc: 'Fetch data, show loading states, handle errors.', deliverable: 'Connected feature' },
      { id: 'fe-5', week: 7, title: 'Accessibility pass', desc: 'Semantic HTML, focus order and screen-reader checks.', deliverable: 'Accessibility fixes' },
    ],
  },
  be: {
    id: 'be', code: 'BE', name: 'Backend Developer',
    accent: '#5ee3bc', accentInk: '#10141b',
    mission: 'Design the data and APIs that keep the app working behind the scenes.',
    tools: ['Node.js or Python', 'PostgreSQL', 'Postman', 'Git', 'REST basics'],
    panel: {
      title: 'API checklist', kind: 'checklist',
      items: [
        { label: 'Every input validated on the server' },
        { label: 'Passwords hashed, never stored plain' },
        { label: 'Errors return a clear message and status code' },
        { label: 'Endpoints documented for the frontend' },
        { label: 'Migrations checked into the repo' },
      ],
    },
    modules: [
      { id: 'be-1', week: 1, title: 'Data modelling', desc: 'Design tables and relationships from the brief.', deliverable: 'ER diagram' },
      { id: 'be-2', week: 2, title: 'Building a REST API', desc: 'Routes, status codes and JSON responses.', deliverable: 'CRUD endpoints' },
      { id: 'be-3', week: 3, title: 'Auth and security', desc: 'Sign-in, sessions, hashing and input validation.', deliverable: 'Auth flow' },
      { id: 'be-4', week: 5, title: 'Working with the frontend', desc: 'Agree on contracts and document endpoints.', deliverable: 'API docs' },
      { id: 'be-5', week: 7, title: 'Performance and logging', desc: 'Indexes, query plans and useful logs.', deliverable: 'Perf notes' },
    ],
  },
  qa: {
    id: 'qa', code: 'QA', name: 'QA Tester',
    accent: '#ff8a7a', accentInk: '#10141b',
    mission: 'Break things on purpose so users never have to.',
    tools: ['Test case template', 'Postman', 'Playwright', 'Bug tracker', 'Screen recorder'],
    panel: {
      title: 'A good bug report has', kind: 'checklist',
      items: [
        { label: 'A clear one-line title' },
        { label: 'Steps to reproduce, numbered' },
        { label: 'Expected vs actual result' },
        { label: 'Screenshot or recording' },
        { label: 'Severity and the device/browser used' },
      ],
    },
    modules: [
      { id: 'qa-1', week: 1, title: 'Thinking like a tester', desc: 'Happy paths, edge cases and how users really behave.', deliverable: 'Test ideas list' },
      { id: 'qa-2', week: 2, title: 'Writing test cases', desc: 'Turn acceptance criteria into test cases.', deliverable: 'Test plan' },
      { id: 'qa-3', week: 3, title: 'Bug reports that get fixed', desc: 'Clear, reproducible, prioritised reports.', deliverable: '5 filed bugs' },
      { id: 'qa-4', week: 5, title: 'API testing', desc: 'Test endpoints directly with Postman.', deliverable: 'API test collection' },
      { id: 'qa-5', week: 7, title: 'Intro to automation', desc: 'Automate a key flow with Playwright.', deliverable: 'Automated test' },
    ],
  },
  devops: {
    id: 'devops', code: 'OPS', name: 'DevOps Engineer',
    accent: '#e3a94a', accentInk: '#10141b',
    mission: 'Help the team ship safely and often.',
    tools: ['Git and GitHub', 'GitHub Actions', 'Docker', 'Vercel or Render', 'Environment variables'],
    panel: {
      title: 'Your pipeline', kind: 'pipeline',
      items: [
        { label: 'Commit', detail: 'Small, focused commits on a branch.' },
        { label: 'Checks', detail: 'Lint and tests run on every pull request.' },
        { label: 'Review', detail: 'A teammate approves before merge.' },
        { label: 'Deploy', detail: 'Merge to main ships to production.' },
        { label: 'Monitor', detail: 'Watch logs and errors after release.' },
      ],
    },
    modules: [
      { id: 'ops-1', week: 1, title: 'Repo setup and branching', desc: 'Branch protection, PR templates and conventions.', deliverable: 'Team repo' },
      { id: 'ops-2', week: 2, title: 'Continuous integration', desc: 'Run checks automatically with GitHub Actions.', deliverable: 'CI workflow' },
      { id: 'ops-3', week: 3, title: 'Containers', desc: 'Package the app with Docker.', deliverable: 'Dockerfile' },
      { id: 'ops-4', week: 5, title: 'Deploying', desc: 'Preview and production deploys, env vars and secrets.', deliverable: 'Live app' },
      { id: 'ops-5', week: 7, title: 'Monitoring and rollbacks', desc: 'Logs, alerts and undoing a bad release.', deliverable: 'Runbook' },
    ],
  },
};

const PATH_IDS = Object.keys(PATHS);
module.exports = { PATHS, PATH_IDS };
