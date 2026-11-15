export type SeedSkill = { name: string; description: string; types: string; subskills: string[] };
export type SeedDomain = { slug: string; name: string; description: string; skills: SeedSkill[] };

const skill = (name: string, description: string, types: string, subskills: string[] = []): SeedSkill => ({
  name,
  description,
  types,
  subskills,
});

const LANGUAGE_SUBSKILLS = ["Writing accuracy", "Reading comprehension", "Vocabulary and register"];

export const skillLibrary: SeedDomain[] = [
  {
    slug: "technical",
    name: "Technical and programming skills",
    description: "Programming, data and software skills.",
    skills: [
      skill("Python", "Writing and reading Python programs, data structures and scripts.", "SF", [
        "Syntax and data structures", "Functions and modules", "File and data handling", "Debugging and testing",
      ]),
      skill("Java", "Object-oriented programming and application logic in Java.", "SF", [
        "Object-oriented design", "Collections and data structures", "Exception handling",
      ]),
      skill("JavaScript", "Scripting for the web: language fundamentals, DOM and asynchronous code.", "SF", [
        "Language fundamentals", "DOM manipulation", "Asynchronous code",
      ]),
      skill("C and C++", "Systems-level programming with memory, pointers and compiled code.", "SF", [
        "Pointers and memory", "Control flow and functions", "Structs and classes",
      ]),
      skill("SQL", "Querying and shaping relational data with SQL.", "DF", [
        "Querying and filtering", "Joins and relationships", "Aggregation and grouping", "Data modelling basics",
      ]),
      skill("Web development", "Building responsive web pages and front-end interfaces.", "SF", [
        "Page structure and semantics", "Styling and responsive layout", "Client-side logic",
      ]),
      skill("Database management", "Designing, maintaining and securing relational databases.", "SD", [
        "Schema design", "Indexing and performance", "Backup and access control",
      ]),
      skill("Data analysis", "Cleaning, summarising and interpreting business datasets.", "DS", [
        "Data cleaning", "Trend and pattern identification", "Calculation and aggregation",
        "Interpreting and reporting findings",
      ]),
      skill("Excel", "Spreadsheet formulas, data organisation, pivot tables and charts.", "DF", [
        "Formulas and functions", "Data organisation and cleaning", "Pivot tables and summaries",
        "Charts and presentation of results",
      ]),
      skill("Software testing", "Planning and writing tests to find and prevent defects.", "SF", [
        "Test case design", "Automated testing", "Defect reporting",
      ]),
      skill("Cybersecurity", "Recognising threats and applying basic security practices.", "S", [
        "Threat awareness", "Access control and authentication", "Secure practices",
      ]),
    ],
  },
  {
    slug: "engineering",
    name: "Engineering and technical design",
    description: "Drafting, design, estimation and construction skills.",
    skills: [
      skill("AutoCAD", "Producing accurate drawings in AutoCAD using layers, dimensions and plot settings.", "F", [
        "Drawing setup and units", "Layers and annotation", "Dimensioning", "Plotting and output",
      ]),
      skill("2D drafting", "Preparing plans, sections and elevations to drawing standards.", "F", [
        "Plans, sections and elevations", "Dimensioning and annotation", "Drawing standards and layers",
      ]),
      skill("3D modelling", "Building and presenting three-dimensional models of designs.", "F", [
        "Solid and surface modelling", "Views and rendering",
      ]),
      skill("Civil engineering", "Core civil engineering principles across materials, structures and site work.", "SD", [
        "Construction materials", "Site practice and safety", "Basic structural concepts",
      ]),
      skill("Structural design", "Sizing and checking structural members and load paths.", "SD", [
        "Load calculation", "Member sizing", "Code compliance",
      ]),
      skill("Quantity estimation", "Measuring work from drawings and preparing quantity and cost estimates.", "DF", [
        "Reading quantities from drawings", "Bill of quantities preparation", "Unit rates and costing",
        "Wastage and allowances",
      ]),
      skill("Surveying", "Measuring and recording land features, levels and distances.", "D", [
        "Levelling", "Distance and angle measurement", "Plotting survey data",
      ]),
      skill("Construction planning", "Sequencing site activities, resources and methods for a build.", "SD", [
        "Work breakdown", "Method and sequencing", "Resource planning",
      ]),
      skill("Project scheduling", "Building and updating project timelines and critical paths.", "DF", [
        "Task dependencies", "Critical path", "Schedule updates and delays",
      ]),
      skill("Technical drawing interpretation", "Reading engineering drawings, symbols and specifications correctly.", "SD", [
        "Symbols and conventions", "Scales and dimensions", "Specification cross-checking",
      ]),
    ],
  },
  {
    slug: "communication",
    name: "Communication skills",
    description: "Speaking, writing and presenting.",
    skills: [
      skill("Public speaking", "Structuring and delivering talks to an audience.", "S"),
      skill("Verbal communication", "Explaining ideas clearly and concisely in conversation.", "S"),
      skill("Written communication", "Writing clear, well-structured and accurate text.", "S", [
        "Clarity and structure", "Tone and professionalism", "Grammar and accuracy",
      ]),
      skill("Presentation skills", "Organising and presenting information persuasively to a group.", "SF", [
        "Structure and flow", "Visual support", "Audience engagement",
      ]),
      skill("Active listening", "Understanding, confirming and responding to what others say.", "S"),
      skill("Professional communication", "Choosing tone and content suited to workplace situations.", "S", [
        "Tone and professionalism", "Clarity and structure", "Handling difficult messages",
      ]),
      skill("Storytelling", "Using narrative to make a message memorable and persuasive.", "S"),
      skill("Client communication", "Keeping clients informed, reassured and aligned, including when news is bad.", "S", [
        "Empathy and acknowledgement", "Explaining the issue clearly", "Resolution and next steps",
      ]),
      skill("Technical explanation", "Explaining complex technical ideas to non-specialists.", "S", [
        "Audience awareness", "Accuracy", "Use of examples",
      ]),
    ],
  },
  {
    slug: "interpersonal",
    name: "Interpersonal and people skills",
    description: "Working with, influencing and leading other people.",
    skills: [
      skill("Negotiation", "Reaching commercially sensible agreements while preserving relationships.", "S", [
        "Preparation and objectives", "Understanding the other party's interests",
        "Commercially sensible proposals", "Relationship preservation",
      ]),
      skill("Leadership", "Setting direction, delegating and motivating a team.", "S", [
        "Setting direction", "Delegation and accountability", "Motivating others",
      ]),
      skill("Teamwork", "Contributing effectively to shared goals within a team.", "S"),
      skill("Conflict resolution", "Resolving disagreements fairly and constructively.", "S", [
        "Diagnosing the conflict", "Fair and constructive options", "Follow-through",
      ]),
      skill("Collaboration", "Working across roles and teams to deliver joint outcomes.", "S"),
      skill("Persuasion", "Building and presenting arguments that influence decisions.", "S"),
      skill("Emotional intelligence", "Recognising and responding to emotions in self and others.", "S"),
      skill("Customer interaction", "Handling customer queries and complaints helpfully and calmly.", "S"),
      skill("Decision-making", "Weighing options and committing to well-reasoned choices.", "S", [
        "Framing the decision", "Weighing trade-offs", "Justification",
      ]),
    ],
  },
  {
    slug: "business",
    name: "Business and commercial skills",
    description: "Marketing, sales, finance and strategy.",
    skills: [
      skill("Marketing", "Planning campaigns and positioning offerings for target audiences.", "S", [
        "Audience targeting", "Messaging and channels", "Measuring results",
      ]),
      skill("Sales", "Qualifying prospects, handling objections and closing deals.", "S", [
        "Qualifying and discovery", "Handling objections", "Closing",
      ]),
      skill("Financial analysis", "Analysing financial data to support business decisions.", "DS", [
        "Ratio and variance analysis", "Budgeting and forecasting", "Decision-focused interpretation",
      ]),
      skill("Business strategy", "Choosing markets, priorities and moves that build advantage.", "S"),
      skill("Entrepreneurship", "Identifying opportunities and launching or growing ventures.", "S"),
      skill("Market research", "Gathering and interpreting data on customers and competitors.", "DS", [
        "Research design", "Data synthesis", "Actionable insights",
      ]),
      skill("Customer relationship management", "Managing customer relationships and pipelines over time.", "S"),
      skill("Business development", "Finding and developing new partnerships and revenue opportunities.", "S"),
    ],
  },
  {
    slug: "analytical",
    name: "Analytical and cognitive skills",
    description: "Reasoning, interpreting and solving problems.",
    skills: [
      skill("Logical reasoning", "Drawing valid conclusions from rules, patterns and premises.", "D", [
        "Pattern recognition", "Deductive reasoning", "Rule application",
      ]),
      skill("Critical thinking", "Evaluating claims, evidence and assumptions.", "S", [
        "Evaluating evidence", "Spotting assumptions and fallacies", "Reaching justified conclusions",
      ]),
      skill("Problem-solving", "Defining problems, generating options and recommending solutions.", "S", [
        "Problem definition", "Generating options", "Evaluating trade-offs", "Justified recommendation",
      ]),
      skill("Research", "Finding, assessing and synthesising information from sources.", "S"),
      skill("Data interpretation", "Reading tables and charts to reach sound conclusions.", "D", [
        "Reading tables and charts", "Identifying trends and outliers", "Drawing valid conclusions",
      ]),
      skill("Strategic thinking", "Connecting long-term goals to present choices.", "S"),
      skill("Planning", "Breaking goals into sequenced, achievable steps.", "S"),
      skill("Risk assessment", "Identifying, rating and mitigating risks.", "SD", [
        "Identifying risks", "Rating likelihood and impact", "Mitigation planning",
      ]),
    ],
  },
  {
    slug: "creative",
    name: "Creative skills",
    description: "Design, media and original problem-solving.",
    skills: [
      skill("Graphic design", "Creating visual layouts with hierarchy, type and colour.", "F", [
        "Layout and hierarchy", "Typography and colour", "Adherence to the brief",
      ]),
      skill("UI/UX design", "Designing usable, accessible interfaces and flows.", "F", [
        "User flows", "Interface layout and consistency", "Accessibility",
      ]),
      skill("Video editing", "Cutting, pacing and finishing video to a brief.", "F", [
        "Pacing and structure", "Audio and colour", "Delivery specifications",
      ]),
      skill("Content writing", "Writing engaging, purposeful content for an audience.", "SF", [
        "Audience and purpose", "Structure and flow", "Style and accuracy",
      ]),
      skill("Creative problem-solving", "Generating original, workable solutions to open problems.", "S"),
      skill("Product design", "Shaping products around user needs and constraints.", "F"),
      skill("Visual communication", "Conveying information clearly through visuals.", "F"),
    ],
  },
  {
    slug: "management",
    name: "Management and operational skills",
    description: "Running projects, people's time and processes.",
    skills: [
      skill("Project management", "Planning, running and delivering projects on time and budget.", "SF", [
        "Scope and planning", "Risk and issue tracking", "Stakeholder updates",
      ]),
      skill("Time management", "Prioritising work and using time effectively.", "S"),
      skill("Resource allocation", "Assigning people, money and materials to competing needs.", "DS", [
        "Capacity assessment", "Prioritisation", "Cost awareness",
      ]),
      skill("Operations", "Running day-to-day processes, suppliers and logistics.", "DS"),
      skill("Organisation", "Structuring work, information and responsibilities clearly.", "S"),
      skill("Process improvement", "Finding and removing waste and bottlenecks in processes.", "S", [
        "Mapping the current process", "Finding bottlenecks", "Proposing and measuring changes",
      ]),
    ],
  },
  {
    slug: "language",
    name: "Language skills",
    description: "Reading, writing and vocabulary in specific languages.",
    skills: [
      skill("English", "Reading, writing and vocabulary in English.", "S", LANGUAGE_SUBSKILLS),
      skill("Kannada", "Reading, writing and vocabulary in Kannada.", "S", LANGUAGE_SUBSKILLS),
      skill("Hindi", "Reading, writing and vocabulary in Hindi.", "S", LANGUAGE_SUBSKILLS),
      skill("Other languages", "Any other language; the specific language is set by each assessment.", "S", LANGUAGE_SUBSKILLS),
    ],
  },
];