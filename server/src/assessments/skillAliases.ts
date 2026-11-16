// Extra phrases that point at a library skill (the skill's own name always matches too).
// Keys are skill slugs.
export const ALIASES: Record<string, string[]> = {
    excel: ["ms excel", "microsoft excel", "spreadsheet", "spreadsheets", "pivot table", "pivot tables", "vlookup", "xlookup"],
    "data-analysis": [
      "analyse data", "analyze data", "analyse business data", "analyze business data",
      "analysing data", "analyzing data", "analyse sales data", "analyze sales data",
      "data analytics", "business data analysis",
    ],
    "data-interpretation": ["interpret data", "interpreting data", "interpret charts", "read charts"],
    sql: ["mysql", "postgresql", "postgres", "sqlite"],
    python: ["python programming", "pandas"],
    javascript: ["typescript", "node.js", "nodejs"],
    "c-and-c-plus-plus": ["c++", "c programming", "cpp"],
    "web-development": ["web developer", "front-end", "frontend", "front end", "html", "css"],
    autocad: ["auto cad", "autodesk autocad"],
    "2d-drafting": ["2d drawing", "2d drawings", "2d plans", "drafting", "technical drafting", "prepare drawings", "prepare plans"],
    "3d-modelling": ["3d modeling", "3d model", "3d models", "3d design"],
    "quantity-estimation": [
      "quantity estimating", "quantity surveying", "estimate quantities", "estimating quantities",
      "bill of quantities", "boq", "quantity take off", "quantity take-off", "cost estimation",
    ],
    "technical-drawing-interpretation": [
      "read drawings", "reading drawings", "interpret drawings", "interpreting drawings",
      "read engineering drawings", "blueprint reading",
    ],
    "construction-planning": ["site planning"],
    "project-scheduling": ["scheduling", "gantt", "critical path", "primavera", "ms project"],
    "project-management": ["project planning", "manage projects", "managing projects", "project coordination"],
    negotiation: ["negotiate", "negotiating", "negotiator", "vendor negotiation", "contract negotiation"],
    "client-communication": [
      "communicate with clients", "communicate clearly with clients", "communicate effectively with clients",
      "communicating with clients", "client-facing", "client facing", "client management",
      "dealing with clients", "client updates",
    ],
    "professional-communication": ["communication", "communicate", "communicating", "communicator", "communication skills", "email etiquette"],
    "written-communication": ["writing skills", "report writing", "email writing", "business writing", "writing reports", "write clearly"],
    "verbal-communication": ["speaking skills", "oral communication", "speak clearly"],
    "public-speaking": ["public speaker"],
    "presentation-skills": ["presenting", "presentation", "presentations"],
    leadership: ["lead a team", "leading a team", "team lead", "team leader", "lead teams"],
    teamwork: ["team player", "work in a team", "work well in teams", "team work"],
    "conflict-resolution": ["resolve conflicts", "resolving conflicts", "dispute resolution", "mediation"],
    "customer-interaction": ["customer service", "customer support", "customer-facing", "customer facing"],
    "problem-solving": ["solve problems", "solving problems", "troubleshooting", "problem solver"],
    "critical-thinking": ["think critically", "analytical thinking", "analytical skills"],
    "logical-reasoning": ["logical thinking", "aptitude"],
    "risk-assessment": ["risk analysis", "risk management", "assess risks"],
    "financial-analysis": ["financial modelling", "financial modeling", "financial reporting", "budget analysis", "budgeting"],
    "market-research": ["competitor analysis", "market analysis", "customer research"],
    marketing: ["digital marketing", "social media marketing", "seo"],
    sales: ["selling", "b2b sales"],
    "business-development": ["lead generation"],
    "time-management": ["manage time", "meet deadlines", "deadline management", "prioritise", "prioritize"],
    operations: ["supply chain", "logistics", "vendor management"],
    "process-improvement": ["process optimisation", "process optimization", "continuous improvement", "six sigma"],
    "resource-allocation": ["resource planning", "allocate resources", "allocating resources", "resource management"],
    "graphic-design": ["photoshop", "illustrator", "canva", "poster design"],
    "ui-ux-design": ["ui design", "ux design", "ui/ux", "figma", "user experience", "wireframes", "wireframing"],
    "video-editing": ["video editor", "premiere pro", "after effects", "davinci resolve", "final cut", "video edit"],
    "content-writing": ["copywriting", "content writer", "blog writing", "copywriter"],
  };
  
  // When a skill is requested, these related skills are *suggested* (never added automatically).
  export const SUGGESTION_RULES: Record<string, { slug: string; reason: string }[]> = {
    excel: [{ slug: "data-analysis", reason: "Excel work usually involves analysing and summarising data." }],
    "data-analysis": [
      { slug: "excel", reason: "Data analysis is commonly done in spreadsheets." },
      { slug: "data-interpretation", reason: "Analysis only helps if the findings are read and explained correctly." },
    ],
    "quantity-estimation": [
      { slug: "technical-drawing-interpretation", reason: "Quantities are measured from drawings, so drawing interpretation is usually needed." },
      { slug: "excel", reason: "Estimates are normally prepared in spreadsheets." },
    ],
    autocad: [{ slug: "technical-drawing-interpretation", reason: "Producing correct drawings relies on reading drawing conventions." }],
    "2d-drafting": [{ slug: "technical-drawing-interpretation", reason: "Drafting and reading drawings go hand in hand." }],
    "project-scheduling": [{ slug: "project-management", reason: "Schedules are usually part of wider project management." }],
    "construction-planning": [{ slug: "project-scheduling", reason: "Construction plans normally include a programme of works." }],
    negotiation: [
      { slug: "persuasion", reason: "Negotiation often relies on building and presenting persuasive arguments." },
      { slug: "decision-making", reason: "Good negotiators weigh trade-offs before committing." },
    ],
    "client-communication": [{ slug: "written-communication", reason: "Client messages are often written, so clarity and tone matter." }],
    "professional-communication": [{ slug: "written-communication", reason: "Workplace communication is frequently written." }],
    sql: [{ slug: "database-management", reason: "SQL work usually sits alongside database design and upkeep." }],
    sales: [{ slug: "negotiation", reason: "Closing deals usually involves negotiating terms." }],
    "financial-analysis": [
      { slug: "excel", reason: "Financial analysis is typically done in spreadsheets." },
      { slug: "data-interpretation", reason: "Reading figures correctly is central to financial analysis." },
    ],
    "problem-solving": [{ slug: "critical-thinking", reason: "Solving problems well depends on evaluating evidence and assumptions." }],
    leadership: [{ slug: "decision-making", reason: "Leaders are expected to make and justify decisions." }],
  };
  
  // Used to decide whether a phrase captured from the text really looks like a job title.
  export const ROLE_NOUNS = new Set([
    "engineer", "developer", "analyst", "associate", "manager", "executive", "officer", "assistant",
    "coordinator", "technician", "designer", "intern", "trainee", "specialist", "consultant",
    "administrator", "supervisor", "surveyor", "architect", "editor", "writer", "accountant",
    "estimator", "drafter", "draughtsman", "planner", "representative", "agent", "clerk", "teacher",
    "tutor", "programmer", "tester", "scientist", "researcher", "strategist", "director", "lead",
    "foreman", "operator", "scheduler", "inspector", "overseer",
  ]);
  
  export const NOT_A_TITLE_START = new Set([
    "somebody", "someone", "anyone", "candidate", "candidates", "person", "people", "individual",
    "assessment", "exam", "test", "help", "to",
  ]);