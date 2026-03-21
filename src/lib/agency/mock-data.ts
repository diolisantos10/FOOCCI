// ─── MOCK DATA — Dioli Agency OS ────────────────────────────────────────────

export type PipelineStage =
  | "briefing"
  | "diagnosis"
  | "planning"
  | "production"
  | "review"
  | "delivery"
  | "ongoing"
  | "completed";

export type Priority = "critical" | "high" | "medium" | "low";
export type ProjectStatus = "active" | "at_risk" | "blocked" | "completed" | "paused";
export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";
export type DeliverableStatus = "draft" | "in_review" | "approved" | "delivered";
export type ClientStatus = "active" | "inactive" | "onboarding";
export type AgentType =
  | "orchestrator"
  | "strategist"
  | "copy"
  | "design"
  | "branding"
  | "landing_page"
  | "traffic"
  | "seo"
  | "social_media"
  | "performance";

// ─── Clients ───────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  industry: string;
  status: ClientStatus;
  website?: string;
  description: string;
  logo?: string;
  activeProjects: number;
  totalProjects: number;
  createdAt: string;
}

export const MOCK_CLIENTS: Client[] = [
  {
    id: "c1",
    name: "Santioh",
    industry: "E-commerce / Fashion",
    status: "active",
    website: "santioh.com",
    description: "Premium streetwear e-commerce brand targeting Gen Z and millennials.",
    activeProjects: 3,
    totalProjects: 5,
    createdAt: "2025-11-01",
  },
  {
    id: "c2",
    name: "Sushikasa",
    industry: "Food & Beverage",
    status: "active",
    website: "sushikasa.com.br",
    description: "Contemporary Japanese restaurant chain focused on delivery and experience.",
    activeProjects: 2,
    totalProjects: 3,
    createdAt: "2025-12-10",
  },
  {
    id: "c3",
    name: "Dioli Studio",
    industry: "Creative Agency",
    status: "onboarding",
    description: "Internal branding and creative output arm of the agency.",
    activeProjects: 1,
    totalProjects: 1,
    createdAt: "2026-01-15",
  },
];

// ─── Agents ───────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  role: string;
  description: string;
  whenToUse: string;
  inputs: string[];
  outputs: string[];
  color: string;
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: "a0",
    name: "Orchestrator",
    type: "orchestrator",
    role: "Project Intelligence Engine",
    description: "Receives the briefing, defines the pipeline, selects agents, maps dependencies, and monitors execution.",
    whenToUse: "Always. Every project starts here.",
    inputs: ["Briefing", "Client profile", "Goal", "Deadline"],
    outputs: ["Pipeline plan", "Agent assignments", "Task breakdown", "Risk flags"],
    color: "#5B5BD6",
  },
  {
    id: "a1",
    name: "Marketing Strategist",
    type: "strategist",
    role: "Strategic Direction",
    description: "Defines positioning, target audience, messaging strategy, and key marketing objectives.",
    whenToUse: "At the start of any campaign, rebrand, or market entry.",
    inputs: ["Briefing", "Market context", "Competitor references"],
    outputs: ["Strategy document", "Positioning map", "Audience personas", "KPIs"],
    color: "#7C3AED",
  },
  {
    id: "a2",
    name: "Copy Agent",
    type: "copy",
    role: "Copywriting & Messaging",
    description: "Produces all written content: ads, landing pages, email sequences, social captions, and scripts.",
    whenToUse: "Any project requiring written communication.",
    inputs: ["Strategy doc", "Brand voice guidelines", "Audience personas"],
    outputs: ["Ad copies", "Landing page copy", "Email sequences", "Caption sets"],
    color: "#0D9488",
  },
  {
    id: "a3",
    name: "Design Agent",
    type: "design",
    role: "Visual Production",
    description: "Creates all visual assets: ads, banners, social posts, presentations, and UI mockups.",
    whenToUse: "When visual deliverables are required.",
    inputs: ["Brand assets", "Copy", "Visual references"],
    outputs: ["Ad creatives", "Social visuals", "Banners", "Presentations"],
    color: "#EA580C",
  },
  {
    id: "a4",
    name: "Branding Agent",
    type: "branding",
    role: "Brand Identity",
    description: "Develops or refines brand identity: logo, palette, typography, tone of voice, and guidelines.",
    whenToUse: "New brand creation, rebrand, or brand audit.",
    inputs: ["Business context", "Market positioning", "References"],
    outputs: ["Brand guide", "Logo files", "Color system", "Typography"],
    color: "#CA8A04",
  },
  {
    id: "a5",
    name: "Landing Page Agent",
    type: "landing_page",
    role: "Conversion Architecture",
    description: "Designs and builds high-converting landing pages with clear hierarchy and CTA strategy.",
    whenToUse: "Product launches, campaign funnels, lead generation.",
    inputs: ["Copy", "Brand assets", "Campaign goal", "CTA definition"],
    outputs: ["Landing page (wireframe + production)", "CTA map", "A/B variants"],
    color: "#16A34A",
  },
  {
    id: "a6",
    name: "Traffic Agent",
    type: "traffic",
    role: "Paid Media",
    description: "Plans and sets up paid media campaigns across Meta, Google, and TikTok.",
    whenToUse: "When running paid acquisition or retargeting.",
    inputs: ["Campaign goal", "Budget", "Audience", "Creatives"],
    outputs: ["Campaign structure", "Ad sets", "Audience targeting", "Budget allocation"],
    color: "#DC2626",
  },
  {
    id: "a7",
    name: "SEO Agent",
    type: "seo",
    role: "Organic Search",
    description: "Executes technical SEO, keyword research, content strategy, and on-page optimization.",
    whenToUse: "Long-term organic growth, content-driven brands.",
    inputs: ["Website", "Keywords", "Competitors"],
    outputs: ["SEO audit", "Keyword map", "Content calendar", "On-page fixes"],
    color: "#5B5BD6",
  },
  {
    id: "a8",
    name: "Social Media Agent",
    type: "social_media",
    role: "Social Presence",
    description: "Manages content strategy, calendar, post production, and community guidelines.",
    whenToUse: "Brand presence, community building, content-driven campaigns.",
    inputs: ["Brand voice", "Content pillars", "Visual identity"],
    outputs: ["Content calendar", "Post set", "Stories", "Captions"],
    color: "#0D9488",
  },
  {
    id: "a9",
    name: "Performance Analyst",
    type: "performance",
    role: "Data & Insights",
    description: "Monitors campaign results, produces reports, and identifies optimization opportunities.",
    whenToUse: "During and after any active campaign or live project.",
    inputs: ["Campaign data", "KPIs", "Benchmarks"],
    outputs: ["Performance report", "Optimization list", "Insights", "Next actions"],
    color: "#7C3AED",
  },
];

// ─── Projects ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  stage: PipelineStage;
  priority: Priority;
  status: ProjectStatus;
  deadline: string;
  description: string;
  goal: string;
  assignedAgents: string[];
  createdAt: string;
}

export const MOCK_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Santioh — Brand Relaunch 2026",
    clientId: "c1",
    clientName: "Santioh",
    stage: "production",
    priority: "critical",
    status: "active",
    deadline: "2026-04-15",
    description: "Full brand identity refresh + campaign for Summer 2026 collection.",
    goal: "Reposition Santioh as a premium streetwear brand and drive 40% growth in online sales.",
    assignedAgents: ["a0", "a1", "a4", "a3", "a2"],
    createdAt: "2026-02-01",
  },
  {
    id: "p2",
    name: "Santioh — Meta Ads Q1",
    clientId: "c1",
    clientName: "Santioh",
    stage: "ongoing",
    priority: "high",
    status: "active",
    deadline: "2026-03-31",
    description: "Paid media campaigns on Meta for Q1 2026 collection.",
    goal: "Achieve ROAS of 4.5x with a monthly budget of R$15,000.",
    assignedAgents: ["a6", "a9"],
    createdAt: "2026-01-10",
  },
  {
    id: "p3",
    name: "Santioh — SEO Foundation",
    clientId: "c1",
    clientName: "Santioh",
    stage: "planning",
    priority: "medium",
    status: "active",
    deadline: "2026-06-30",
    description: "Technical SEO + content strategy to build organic search presence.",
    goal: "Rank top 3 for 20 priority keywords in 6 months.",
    assignedAgents: ["a7"],
    createdAt: "2026-02-15",
  },
  {
    id: "p4",
    name: "Sushikasa — Delivery Campaign",
    clientId: "c2",
    clientName: "Sushikasa",
    stage: "review",
    priority: "high",
    status: "at_risk",
    deadline: "2026-03-25",
    description: "Campaign to increase delivery orders via iFood and direct channels.",
    goal: "30% increase in weekly delivery orders in 60 days.",
    assignedAgents: ["a0", "a1", "a2", "a3", "a6"],
    createdAt: "2026-01-20",
  },
  {
    id: "p5",
    name: "Sushikasa — Social Media Presence",
    clientId: "c2",
    clientName: "Sushikasa",
    stage: "diagnosis",
    priority: "medium",
    status: "active",
    deadline: "2026-05-01",
    description: "Monthly social media content production and community strategy.",
    goal: "Grow Instagram to 10k followers with 5%+ engagement rate.",
    assignedAgents: ["a8", "a3"],
    createdAt: "2026-02-28",
  },
  {
    id: "p6",
    name: "Dioli Studio — Internal Brand",
    clientId: "c3",
    clientName: "Dioli Studio",
    stage: "briefing",
    priority: "low",
    status: "active",
    deadline: "2026-07-01",
    description: "Brand identity for the internal studio arm of the agency.",
    goal: "Define a distinct visual and verbal identity for Dioli Studio.",
    assignedAgents: ["a4"],
    createdAt: "2026-03-01",
  },
];

// ─── Tasks ─────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  clientName: string;
  agentId: string;
  agentName: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  description: string;
}

export const MOCK_TASKS: Task[] = [
  {
    id: "t1",
    title: "Finalize brand guidelines document",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    agentId: "a4",
    agentName: "Branding Agent",
    status: "in_progress",
    priority: "critical",
    dueDate: "2026-03-22",
    description: "Complete the brand guide including logo variations, color system, and typography.",
  },
  {
    id: "t2",
    title: "Produce 6 ad creatives for Meta",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    agentId: "a3",
    agentName: "Design Agent",
    status: "pending",
    priority: "critical",
    dueDate: "2026-03-28",
    description: "Create 6 static ad formats (feed + stories) for the relaunch campaign.",
  },
  {
    id: "t3",
    title: "Write campaign copy — 3 angle variants",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    agentId: "a2",
    agentName: "Copy Agent",
    status: "done",
    priority: "high",
    dueDate: "2026-03-18",
    description: "Produce three distinct copy angles for A/B testing.",
  },
  {
    id: "t4",
    title: "Optimize Meta campaign bidding strategy",
    projectId: "p2",
    projectName: "Santioh — Meta Ads Q1",
    clientName: "Santioh",
    agentId: "a6",
    agentName: "Traffic Agent",
    status: "in_progress",
    priority: "high",
    dueDate: "2026-03-23",
    description: "Shift from cost-cap to lowest-cost on top 3 ad sets based on last week's data.",
  },
  {
    id: "t5",
    title: "Review Sushikasa delivery campaign creatives",
    projectId: "p4",
    projectName: "Sushikasa — Delivery Campaign",
    clientName: "Sushikasa",
    agentId: "a3",
    agentName: "Design Agent",
    status: "blocked",
    priority: "high",
    dueDate: "2026-03-21",
    description: "Awaiting updated menu photography from client before final creative production.",
  },
  {
    id: "t6",
    title: "Keyword research for SEO Foundation",
    projectId: "p3",
    projectName: "Santioh — SEO Foundation",
    clientName: "Santioh",
    agentId: "a7",
    agentName: "SEO Agent",
    status: "pending",
    priority: "medium",
    dueDate: "2026-04-05",
    description: "Map 100 priority keywords across product, brand, and informational intent.",
  },
];

// ─── Deliverables ─────────────────────────────────────────────────────────

export interface Deliverable {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  clientName: string;
  type: string;
  status: DeliverableStatus;
  agentName: string;
  producedAt: string;
  link?: string;
}

export const MOCK_DELIVERABLES: Deliverable[] = [
  {
    id: "d1",
    name: "Santioh Positioning Strategy",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    type: "Strategy Document",
    status: "approved",
    agentName: "Marketing Strategist",
    producedAt: "2026-03-05",
  },
  {
    id: "d2",
    name: "Campaign Copy — 3 Variants",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    type: "Copywriting",
    status: "approved",
    agentName: "Copy Agent",
    producedAt: "2026-03-18",
  },
  {
    id: "d3",
    name: "Brand Guidelines v1",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    type: "Brand Document",
    status: "in_review",
    agentName: "Branding Agent",
    producedAt: "2026-03-20",
  },
  {
    id: "d4",
    name: "Meta Ads Performance Report — Week 10",
    projectId: "p2",
    projectName: "Santioh — Meta Ads Q1",
    clientName: "Santioh",
    type: "Performance Report",
    status: "delivered",
    agentName: "Performance Analyst",
    producedAt: "2026-03-17",
  },
  {
    id: "d5",
    name: "Sushikasa Delivery Campaign — Ad Creatives",
    projectId: "p4",
    projectName: "Sushikasa — Delivery Campaign",
    clientName: "Sushikasa",
    type: "Design Files",
    status: "draft",
    agentName: "Design Agent",
    producedAt: "2026-03-19",
  },
];

// ─── Briefings ─────────────────────────────────────────────────────────────

export interface Briefing {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  goal: string;
  targetAudience: string;
  keyMessage: string;
  deliverables: string[];
  deadline: string;
  budget?: string;
  successCriteria: string;
  submittedAt: string;
  status: "pending_analysis" | "analyzed" | "approved";
}

export const MOCK_BRIEFINGS: Briefing[] = [
  {
    id: "b1",
    projectId: "p1",
    projectName: "Santioh — Brand Relaunch 2026",
    clientName: "Santioh",
    goal: "Relaunch Santioh as a premium streetwear brand for Summer 2026.",
    targetAudience: "Males and females 18–32, urban, fashion-forward, Brazil and Portugal.",
    keyMessage: "Santioh is not clothing. It is identity.",
    deliverables: ["Brand guide", "Campaign creatives", "Landing page", "Social content"],
    deadline: "2026-04-15",
    budget: "R$ 25,000",
    successCriteria: "40% increase in online sales, 60% increase in brand searches.",
    submittedAt: "2026-02-01",
    status: "approved",
  },
  {
    id: "b2",
    projectId: "p4",
    projectName: "Sushikasa — Delivery Campaign",
    clientName: "Sushikasa",
    goal: "Drive 30% increase in delivery orders in 60 days.",
    targetAudience: "Adults 25–45, urban families and professionals in São Paulo.",
    keyMessage: "Restaurant-quality sushi delivered to your door in under 40 minutes.",
    deliverables: ["Paid media campaigns", "Ad creatives", "Landing page"],
    deadline: "2026-03-25",
    budget: "R$ 12,000",
    successCriteria: "30% order volume increase, CPO below R$18.",
    submittedAt: "2026-01-20",
    status: "analyzed",
  },
  {
    id: "b3",
    projectId: "p6",
    projectName: "Dioli Studio — Internal Brand",
    clientName: "Dioli Studio",
    goal: "Create the visual identity for Dioli Studio as an internal creative arm.",
    targetAudience: "Internal use + future client-facing presentations.",
    keyMessage: "Precision, creativity, and intelligence — built in.",
    deliverables: ["Logo", "Color system", "Typography", "Brand guide"],
    deadline: "2026-07-01",
    successCriteria: "A complete, premium brand identity system ready for use.",
    submittedAt: "2026-03-01",
    status: "pending_analysis",
  },
];

// ─── Brand Assets ──────────────────────────────────────────────────────────

export interface BrandAsset {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  type: "logo" | "color_palette" | "typography" | "tone_of_voice" | "visual_reference" | "guideline";
  description: string;
  uploadedAt: string;
}

export const MOCK_BRAND_ASSETS: BrandAsset[] = [
  {
    id: "ba1",
    clientId: "c1",
    clientName: "Santioh",
    name: "Primary Logo (Black)",
    type: "logo",
    description: "Main wordmark in black. Use on white/light backgrounds.",
    uploadedAt: "2026-02-03",
  },
  {
    id: "ba2",
    clientId: "c1",
    clientName: "Santioh",
    name: "Color Palette",
    type: "color_palette",
    description: "Primary: #0A0A0A. Secondary: #F5F5F5. Accent: #E5C97E.",
    uploadedAt: "2026-02-03",
  },
  {
    id: "ba3",
    clientId: "c2",
    clientName: "Sushikasa",
    name: "Sushikasa Logo",
    type: "logo",
    description: "Full color logo with Japanese-inspired mark.",
    uploadedAt: "2026-01-22",
  },
  {
    id: "ba4",
    clientId: "c2",
    clientName: "Sushikasa",
    name: "Tone of Voice Guide",
    type: "tone_of_voice",
    description: "Warm, sophisticated, and approachable. Never overly casual.",
    uploadedAt: "2026-01-22",
  },
];

// ─── Activity ──────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  type: "task_completed" | "deliverable_uploaded" | "project_advanced" | "briefing_submitted" | "agent_assigned";
  description: string;
  project?: string;
  client?: string;
  timestamp: string;
}

export const MOCK_ACTIVITY: Activity[] = [
  {
    id: "ac1",
    type: "task_completed",
    description: "Campaign copy (3 variants) marked as done",
    project: "Santioh — Brand Relaunch 2026",
    client: "Santioh",
    timestamp: "2026-03-20T14:32:00",
  },
  {
    id: "ac2",
    type: "deliverable_uploaded",
    description: "Brand Guidelines v1 submitted for review",
    project: "Santioh — Brand Relaunch 2026",
    client: "Santioh",
    timestamp: "2026-03-20T11:15:00",
  },
  {
    id: "ac3",
    type: "project_advanced",
    description: "Sushikasa Delivery Campaign moved to Review",
    project: "Sushikasa — Delivery Campaign",
    client: "Sushikasa",
    timestamp: "2026-03-19T16:00:00",
  },
  {
    id: "ac4",
    type: "briefing_submitted",
    description: "Briefing submitted for Dioli Studio Internal Brand",
    project: "Dioli Studio — Internal Brand",
    client: "Dioli Studio",
    timestamp: "2026-03-19T09:45:00",
  },
  {
    id: "ac5",
    type: "deliverable_uploaded",
    description: "Meta Ads Week 10 performance report delivered",
    project: "Santioh — Meta Ads Q1",
    client: "Santioh",
    timestamp: "2026-03-17T17:20:00",
  },
];
