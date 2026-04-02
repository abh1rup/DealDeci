{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # Ole Miss Inspired Style Guide\
\
**Version:** 1.0  \
**Purpose:** Create a modern, premium website that captures the spirit of the University of Mississippi (Ole Miss) homepage \'97 clean, authoritative, warm, energetic, and deeply rooted in Southern academic tradition with a contemporary twist.  \
**Key Aesthetic Notes:**  \
- Professional yet approachable academic feel  \
- Generous use of **rounded corners** (soft, friendly, modern)  \
- High-quality photography of campus life, students, and landmarks  \
- Energetic red accents against deep navy and clean whites  \
- Excellent typography hierarchy and breathing room (whitespace)  \
- Rounded, modern icons for navigation and CTAs\
\
**Motto vibe:** "Hotty Toddy" energy \'97 proud, welcoming, vibrant.\
\
## 1. Color Palette\
\
### Primary Colors\
- **Cardinal Red** (Ole Miss signature red) \'97 `#CE1126`  \
  - Use for accents, buttons, links, headlines, and energetic elements\
- **Navy Blue** (Deep, authoritative) \'97 `#14213D`  \
  - Use for headers, footers, primary text, navigation\
\
### Supporting Colors\
- **White** \'97 `#FFFFFF` (backgrounds, cards)\
- **Light Gray / Off-White** \'97 `#F8F9FA` or `#F5F5F5` (section backgrounds)\
- **Cool Gray** \'97 `#6B7280` (PANTONE Cool Gray 9 inspired) for secondary text\
- **Dark Text** \'97 `#1F2937` (near-black for body copy)\
- **Accent Light Blue** (subtle sky/blue tones seen in campus imagery) \'97 `#A5D6FF` or `#89CFF0` (use sparingly)\
\
**Usage Rules:**\
- Primary CTA buttons: Red background with white text\
- Secondary buttons: Navy or white with navy border/text\
- Links: Red on hover, navy by default\
- Ensure high contrast (WCAG AA compliant)\
\
## 2. Typography\
\
**Primary Font (Sans-serif \'97 clean and modern):**  \
- **System stack recommendation:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`  \
- Fallback/closest free alternative: **Inter** or **Asap** (Google Fonts) \'97 clean, professional sans-serif used in similar university contexts.\
\
**Heading Font (for premium feel):**  \
- **Heading 1\'963:** Bold weight, slightly condensed tracking for impact  \
- Optional premium serif for hero/subheads: Georgia or a modern serif like "Playfair Display" (use sparingly for elegance)\
\
**Font Sizes & Hierarchy (Tailwind/rem based):**\
\
- **H1 (Hero/Main Title):** 3.5rem (56px) / 4.5rem on large screens \'97 font-weight: 700\'96800 \'97 line-height: 1.1\
- **H2 (Section Titles):** 2.25rem (36px) \'97 font-weight: 700\
- **H3:** 1.875rem (30px) \'97 font-weight: 600\
- **Body Text:** 1.125rem (18px) \'97 line-height: 1.7 \'97 font-weight: 400\
- **Navigation & Buttons:** 1rem (16px) \'97 medium weight\
- **Small/Captions:** 0.875rem (14px)\
\
**Recommendations:**\
- Excellent letter spacing on headings (`tracking-tight`)\
- Generous line height for readability\
- All caps sparingly for navigation or accents\
\
## 3. Rounded Corners & Shadows\
\
**Border Radius (very important \'97 "rounded and good"):**\
- Small elements (buttons, inputs, small cards): `rounded-2xl` or `border-radius: 16px`\
- Medium cards/images: `rounded-3xl` or `border-radius: 24px`\
- Large containers/hero overlays: `rounded-3xl`\
- Icons & avatars: fully rounded (`rounded-full`)\
\
**Shadows (subtle, premium lift):**\
- Light: `shadow-sm` (soft elevation)\
- Medium cards: `shadow-md` or custom `0 10px 15px -3px rgb(0 0 0 / 0.05)`\
- Hover lift: `hover:shadow-xl transition-shadow duration-300`\
\
## 4. Icons\
\
- **Style:** Modern, rounded, clean line icons with slight thickness. Prefer **filled** variants for primary actions and **outline** for secondary.\
- Recommended libraries:\
  - **Lucide Icons** (highly recommended \'97 excellent rounded feel)\
  - **Heroicons** (v2)\
  - **Tabler Icons**\
- Size guide: 20px (nav), 24px (small buttons), 28\'9632px (feature icons), 48px+ (hero/decorative)\
- Color: Red or Navy to match palette\
- Example usage: Chevron with rounded ends, user icons, campus-related (book, trophy, leaf, etc.)\
\
## 5. Layout & Spacing\
\
- **Grid System:** 12-column, max-width ~1280\'961440px centered\
- **Container padding:** `px-6 md:px-8 lg:px-12`\
- **Section vertical spacing:** 5\'967rem (80\'96112px) on desktop, 3\'964rem on mobile\
- **Card grids:** 1-col mobile \uc0\u8594  2-col tablet \u8594  3-col desktop (or 4-col for some sections)\
- **Whitespace is your friend** \'97 generous margins around content blocks\
\
**Hero Section Pattern:**\
- Full-width or large height (90\'96100vh)\
- Background: high-quality campus photo or video with subtle dark overlay\
- Centered content with large headline, subhead, and prominent red CTA buttons\
- Rounded search bar or quick links if applicable\
\
## 6. Buttons & Interactive Elements\
\
**Primary Button:**\
- Background: `#CE1126`\
- Text: White\
- Padding: `px-8 py-4`\
- Rounded: `rounded-2xl` or `rounded-3xl`\
- Hover: darker red + slight scale (105%)\
- Font: medium, uppercase tracking or normal case\
\
**Secondary Button:**\
- Outline navy or white with navy text\
- Same generous padding and rounding\
\
**Link Style:**\
- Underline on hover only\
- Red accent color for primary links\
\
**Hover States:** Smooth transitions (300ms), subtle lift on cards, color shifts on buttons.\
\
## 7. Imagery & Photography\
\
- **Style:** Warm, vibrant, authentic campus life photos\
  - Students collaborating, cheering at games, walking historic paths (Lyceum columns, Grove, etc.)\
  - Golden hour lighting preferred\
  - Diverse, energetic, inclusive representation\
- **Treatment:** \
  - Soft rounded corners on images (`rounded-3xl`)\
  - Subtle overlays on hero\
  - Consistent cropping \'97 focus on people + architecture\
- **Aspect Ratios:** 16:9 for wide, 4:3 or square for cards\
\
## 8. Navigation\
\
- **Top Nav:** Clean, minimal \'97 logo left, menu items center or right, "Apply/Visit" red button\
- **Mobile:** Hamburger with slide-in menu, rounded drawer\
- **Dropdowns:** Soft rounded cards with shadow\
- Sticky on scroll with subtle shadow\
\
## 9. Footer\
\
- Dark navy background\
- Multi-column layout: Links, contact, social icons (rounded)\
- Small legal text at bottom\
- Red accent line or logo\
\
## 10. Overall Page Structure Inspiration (Ole Miss-like)\
\
1. Sticky Top Navigation\
2. Hero with large image + overlay + CTAs\
3. Quick Links / Feature Cards (rounded, icon-top)\
4. About / Why Ole Miss section\
5. News / Events grid\
6. Campus Life / Academics highlights\
7. Testimonials or Student Stories\
8. Footer\
\
**Additional Tips for Implementation:**\
- Use Tailwind CSS with custom config for colors and radii\
- Add micro-interactions (hover scales, smooth scrolls)\
- Ensure fast loading with optimized images\
- Mobile-first with excellent touch targets\
- "Hotty Toddy" spirit: Make it feel proud, welcoming, and full of life\
\
---\
\
**Ready to build?**  \
Copy this guide and prompt your AI: "Create a responsive homepage in HTML/Tailwind that perfectly matches this Ole Miss style guide. Use generous rounded corners everywhere, beautiful icons, and high-quality placeholder images of a university campus."\
\
Let me know if you want a **Tailwind config snippet**, **component examples** (hero, card, button), or **dark mode variant** added to the guide!}