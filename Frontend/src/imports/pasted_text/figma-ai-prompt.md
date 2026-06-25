# ============================================================
# FIGMA AI — LANDING PAGE PROMPT
# Smart Teaching & Lab Management Platform
# ============================================================

# CRITICAL INSTRUCTION:
# Do NOT make a role-selection screen or a dashboard home page.
# Build a FULL MARKETING LANDING PAGE — like Linear.app, Vercel.com,
# or Render.com — that a visitor sees before they ever log in.
# This is a public-facing page that sells and explains the product.

# Also: Fix ALL warnings in the generated code before finalizing.
# Do not leave any unused variables, missing keys, undefined props,
# or accessibility warnings unresolved.

# ============================================================
# SECTION 1 — PAGE IDENTITY
# ============================================================

product_name: "Lab Control"
tagline:      "The Smart Teaching & Lab Management Platform"
audience:     "University professors and students"
page_goal:    "Convince a faculty member or university admin to adopt this platform"
tone:         "Professional, modern, confident — like Apple meets Linear"

# ============================================================
# SECTION 2 — VISUAL DESIGN SYSTEM
# ============================================================

colors:
  bg:           "#0A0A0F"   # Deep near-black, cool undertone
  surface:      "#111118"   # Card and section backgrounds
  surface_2:    "#1A1A24"   # Elevated panels
  border:       "rgba(255,255,255,0.07)"
  accent_blue:  "#4F8EF7"   # Primary CTA, highlights
  accent_green: "#22C55E"   # Live / active states
  text_white:   "#F0F0F5"
  text_muted:   "#8B8BA7"
  text_dim:     "#4A4A6A"

typography:
  heading_font: "Inter, weight 700, tracking -0.04em"
  body_font:    "Inter, weight 400, line-height 1.7"
  mono_font:    "JetBrains Mono — for code snippets, stats, badges"

border_radius:
  cards:   "16px"
  buttons: "10px"
  badges:  "999px"

# ============================================================
# SECTION 3 — NAVBAR
# ============================================================

navbar:
  style:       "Fixed top, frosted glass"
  background:  "rgba(10,10,15,0.85), backdrop-filter blur(16px)"
  border:      "1px solid rgba(255,255,255,0.07) on bottom"
  behavior:    "Hides on scroll down. Slides back in on scroll up. 300ms ease."
  left:        "Logo — 'Lab Control' wordmark in white, bold"
  center:      "Nav links — Features | How It Works | For Students | Pricing"
  right:       "Two buttons — 'Log In' (ghost) and 'Get Started' (filled blue)"
  link_hover:  "Underline grows from center outward, 200ms"

# ============================================================
# SECTION 4 — HERO SECTION
# ============================================================

hero:
  height:   "100vh, vertically centered content"
  layout:   "Center-aligned text block, full width"

  eyebrow:
    text:  "Now in Beta — Built for University Labs"
    style: "pill badge, border rgba(79,142,247,0.3), text #4F8EF7, mono font 11px uppercase"

  headline:
    line1: "Teaching, Upgraded."
    line2: "Labs, In Control."
    style: "80px, weight 800, tracking -0.05em, white"
    note:  "Line 2 uses a left-to-right gradient from #4F8EF7 to #22C55E as text fill"

  subheadline:
    text:  "Live screen broadcasting, auto attendance, secure exams, and real-time analytics — all in one platform built for computer labs."
    style: "20px, #8B8BA7, max-width 580px, centered"

  cta_row:
    primary:   "Get Early Access — filled blue, 48px tall, rounded 10px, arrow icon right"
    secondary: "Watch Demo → — ghost, same height"
    gap:       "16px between buttons"

  background:
    type: "Animated ambient gradient mesh"
    elements:
      - "Soft blue orb top-left — rgba(79,142,247,0.10), 600px, blurred 120px, slow float"
      - "Soft green orb bottom-right — rgba(34,197,94,0.07), 500px, blurred 120px, slow drift"
    note: "NO particles. NO noise texture. Subtle, restrained, elegant."

  hero_visual:
    type:     "Floating UI mockup window"
    content:  "Screenshot of the Teacher Dashboard (Control Center) inside a browser-frame window"
    style:    "border-radius 16px, shadow 0 40px 120px rgba(0,0,0,0.7), slight 3D perspective tilt (rotateX 6deg rotateY -4deg)"
    position: "Below the CTA row, centered, partially cut off at bottom to invite scroll"
    animation: "Floats up and down gently — translateY 0px to -12px, 4s ease-in-out infinite"

  scroll_cue:
    type:  "Thin vertical line with a downward-moving dot"
    color: "#4A4A6A"
    position: "Bottom center of viewport"

# ============================================================
# SECTION 5 — SOCIAL PROOF BAR
# ============================================================

social_proof:
  position: "Just below hero, full width"
  background: "#111118"
  border_top: "1px solid rgba(255,255,255,0.06)"
  border_bottom: "1px solid rgba(255,255,255,0.06)"
  content:
    text_left: "Trusted in university computer labs across India"
    stats:
      - value: "2,400+"  label: "Students Managed"
      - value: "120+"    label: "Lab Sessions Run"
      - value: "98%"     label: "Attendance Accuracy"
      - value: "0"       label: "Manual Processes"
  stat_number_style: "JetBrains Mono, 28px, #F0F0F5, weight 600"
  stat_label_style:  "11px uppercase, #4A4A6A, tracking 0.08em"
  animation: "Numbers count up from 0 when section enters viewport — IntersectionObserver"

# ============================================================
# SECTION 6 — FEATURES (Alternating Layout)
# ============================================================

# All sections animate in on scroll using IntersectionObserver.
# Animation: opacity 0→1, translateY 40px→0, 600ms ease-out.
# Animate ONCE on entry. Do NOT re-animate on scroll up.

features:
  layout: "Alternating — text left + visual right, then text right + visual left"
  visual_style: "Real UI mockup in a floating app window, border-radius 12px, deep shadow"
  text_max_width: "480px"

  items:

    - id: 1
      tag:      "LIVE BROADCAST"
      headline: "Every student sees exactly what you see."
      body:     "Share your screen in real time — live coding, browser tabs, IDEs, presentations. No lag. No confusion. Every student follows, always."
      visual:   "Broadcast screen showing Binary Search Trees code — Image 2"
      side:     "text left, visual right"
      accent:   "#4F8EF7"

    - id: 2
      tag:      "STUDENT MONITOR"
      headline: "Know who's focused. Know who needs help."
      body:     "See every student's screen in a live grid. Spot idle students instantly. Click any card for a full view. View-only — no disruption to their work."
      visual:   "Student monitor grid with active/idle/offline cards — Image 3"
      side:     "text right, visual left"
      accent:   "#22C55E"

    - id: 3
      tag:      "AUTO ATTENDANCE"
      headline: "Roll call, handled."
      body:     "Attendance is tracked automatically from login activity. Present, partial, or absent — determined without a single manual entry."
      visual:   "Attendance table with Present/Partial/Absent badges — Image 6"
      side:     "text left, visual right"
      accent:   "#4F8EF7"

    - id: 4
      tag:      "SECURE EXAMS"
      headline: "Randomized. Timed. Tamper-proof."
      body:     "Each student gets unique questions. A countdown timer enforces the deadline. Screens lock automatically the moment time expires — no manual intervention needed."
      visual:   "Exam creation flow with stepper — Image 5"
      side:     "text right, visual left"
      accent:   "#F59E0B"

    - id: 5
      tag:      "ANALYTICS"
      headline: "See the gaps before they become problems."
      body:     "Track attendance trends, task completion, and exam scores over time. At-risk students are surfaced automatically so you can act early."
      visual:   "Analytics dashboard with charts and at-risk table — Image 7"
      side:     "text left, visual right"
      accent:   "#22C55E"

# ============================================================
# SECTION 7 — HOW IT WORKS
# ============================================================

how_it_works:
  headline: "Up and running in 3 steps."
  layout:   "3 horizontal cards side by side"
  card_style: "background #111118, border rgba(255,255,255,0.07), border-radius 16px, padding 32px"

  steps:
    - number: "01"
      title:  "Start a Lab Session"
      body:   "Open Lab Control, create a session for your lab room. Students join automatically when they log in."
      icon:   "play circle"

    - number: "02"
      title:  "Teach, Assign & Monitor"
      body:   "Broadcast your screen live, assign coding tasks, and watch every student's progress in real time."
      icon:   "monitor"

    - number: "03"
      title:  "Review & Improve"
      body:   "After the session, attendance is logged, submissions are collected, and analytics are ready instantly."
      icon:   "bar chart"

  number_style: "JetBrains Mono, 48px, rgba(79,142,247,0.15), weight 700"
  connector:    "Subtle dashed line connecting the three cards horizontally"

# ============================================================
# SECTION 8 — STUDENT VIEW SECTION
# ============================================================

student_section:
  eyebrow:  "FOR STUDENTS"
  headline: "Everything you need, in one place."
  body:     "Join live sessions, receive tasks directly in your browser, submit code without switching tools, and track your own attendance and grades — all from a single dashboard."
  visual:   "Student dashboard mockup — Image 9"
  cta:      "See Student View →"
  bg:       "Slightly lighter surface — #111118, full bleed section"

# ============================================================
# SECTION 9 — FINAL CTA SECTION
# ============================================================

final_cta:
  bg:        "Radial gradient — rgba(79,142,247,0.10) at center, fades to #0A0A0F"
  border_top: "1px solid rgba(79,142,247,0.15)"
  headline:  "Your lab, smarter."
  subtext:   "No installation. No hardware. Just open a browser and teach."
  cta:       "Get Early Access — large, filled blue, centered"
  footnote:  "Free for academic institutions during beta."

# ============================================================
# SECTION 10 — FOOTER
# ============================================================

footer:
  bg:         "#0A0A0F"
  border_top: "1px solid rgba(255,255,255,0.06)"
  layout:     "4 columns"
  columns:
    - "Lab Control (logo + one-line description)"
    - "Product: Features, How It Works, Pricing, Changelog"
    - "For Users: Teachers, Students, Administrators"
    - "Company: About, Contact, Privacy Policy"
  bottom_bar: "© 2026 Lab Control. Built for universities."
  text_color: "#4A4A6A"

# ============================================================
# SECTION 11 — ANIMATIONS MASTER LIST
# ============================================================

animations:
  - name: "Navbar hide/show on scroll"
    type: "transform translateY(-100%) on scroll down, 0 on scroll up"
    duration: "300ms ease"

  - name: "Hero ambient orbs"
    type: "keyframe float — translateX and translateY slow drift"
    duration: "12s–16s ease-in-out infinite, alternating"

  - name: "Hero mockup float"
    type: "translateY 0 to -12px to 0"
    duration: "4s ease-in-out infinite"

  - name: "Hero mockup entrance"
    type: "opacity 0→1, translateY 48px→0, scale 0.97→1"
    duration: "800ms ease-out, 300ms delay"

  - name: "Section scroll reveal"
    type: "IntersectionObserver — opacity 0→1, translateY 40px→0"
    duration: "600ms ease-out"
    note: "Trigger once only. Not on re-entry."

  - name: "Stat counter"
    type: "Count from 0 to value on viewport entry"
    duration: "1200ms ease-out"

  - name: "Feature tag badge entrance"
    type: "opacity 0→1, translateX -10px→0"
    duration: "400ms ease-out, slight delay before headline"

  - name: "CTA button hover"
    type: "scale 1→1.03, shadow deepens"
    duration: "160ms ease"

  - name: "CTA button press"
    type: "scale 1.03→0.97 on mousedown, springs to 1 on release"
    duration: "100ms"

  - name: "Nav link underline"
    type: "scaleX 0→1 from center, transform-origin center"
    duration: "200ms ease"

  global_rule: "Wrap ALL animations in @media (prefers-reduced-motion: reduce) — disable or reduce inside"

# ============================================================
# SECTION 12 — CODE QUALITY RULES (Fix All Warnings)
# ============================================================

code_quality:
  - "Fix ALL React/JSX warnings before output — no warnings should remain"
  - "Add unique 'key' prop to every element rendered inside a map()"
  - "Remove all unused imports and unused variables"
  - "Add alt text to every image and aria-label to every icon button"
  - "Ensure no console.error or console.warn is triggered on load"
  - "All props must be defined — no undefined prop references"
  - "Use semantic HTML — nav, main, section, footer, h1/h2/h3 in correct order"
  - "Only one h1 on the page (the hero headline)"
  - "Every interactive element must be keyboard accessible (tabIndex, onKeyDown)"
  - "Color contrast must meet WCAG AA for all text"

# ============================================================
# FINAL INSTRUCTION TO FIGMA AI
# ============================================================

# Build this as a COMPLETE, SCROLLABLE, SINGLE-PAGE WEBSITE.
# This is NOT a dashboard. NOT a login screen. NOT a role selector.
# This is a PUBLIC MARKETING PAGE — the first thing a visitor sees.
#
# The quality bar is: Linear.app, Vercel.com, Render.com.
# Every section must feel intentional, polished, and premium.
# When in doubt — add more whitespace, not more elements.
# Resolve every warning. Ship clean code.