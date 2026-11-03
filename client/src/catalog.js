// Library of services shown in the search suggestions: [label, category, keywords]
// Categories must stay one of: Design, Development, Writing, Video, Marketing
const RAW = [
  // Design
  ['Logo design', 'Design', 'logo brand mark emblem wordmark'],
  ['Brand identity', 'Design', 'branding identity style guide colors fonts'],
  ['Business card design', 'Design', 'business card stationery letterhead'],
  ['Poster and flyer design', 'Design', 'poster flyer brochure leaflet pamphlet'],
  ['Social media graphics', 'Design', 'instagram post story canva graphics banner'],
  ['UI/UX design', 'Design', 'ui ux figma app design wireframe prototype'],
  ['Website mockup in Figma', 'Design', 'figma mockup website design landing'],
  ['Mobile app design', 'Design', 'app screens ios android ui'],
  ['Illustration', 'Design', 'illustration drawing digital art cartoon character'],
  ['Packaging design', 'Design', 'packaging label box product'],
  ['Infographic design', 'Design', 'infographic chart visual'],
  ['Presentation design', 'Design', 'powerpoint ppt pitch deck slides'],
  ['T-shirt and merch design', 'Design', 'tshirt t-shirt merch apparel print'],
  ['Book cover design', 'Design', 'book cover ebook kindle'],
  ['YouTube thumbnail design', 'Design', 'thumbnail youtube cover'],
  ['Icon and sticker design', 'Design', 'icon sticker emoji'],
  ['3D modeling and rendering', 'Design', '3d model render blender'],
  // Development
  ['React website', 'Development', 'react frontend javascript web'],
  ['Full-stack web app', 'Development', 'fullstack mern node react web application'],
  ['Node.js backend and API', 'Development', 'node express api backend server rest'],
  ['WordPress website', 'Development', 'wordpress wp theme plugin cms'],
  ['Shopify store setup', 'Development', 'shopify ecommerce store woocommerce'],
  ['Android and iOS app', 'Development', 'android ios mobile app kotlin swift'],
  ['Flutter app', 'Development', 'flutter dart cross platform app'],
  ['Python scripting and automation', 'Development', 'python script automation bot'],
  ['Web scraping', 'Development', 'scraper scraping data extraction crawler'],
  ['Bug fixing', 'Development', 'bug fix debug error issue'],
  ['Database design', 'Development', 'database sql mysql mongodb schema'],
  ['Chatbot development', 'Development', 'chatbot bot ai whatsapp telegram'],
  ['AI and machine learning', 'Development', 'ai ml machine learning model data science'],
  ['Landing page development', 'Development', 'landing page html css website'],
  ['Portfolio website', 'Development', 'portfolio personal website'],
  ['Game development', 'Development', 'game unity unreal'],
  ['Deployment and DevOps', 'Development', 'deploy hosting aws docker server devops'],
  // Writing
  ['Blog posts', 'Writing', 'blog article post content'],
  ['SEO articles', 'Writing', 'seo article keyword ranking content'],
  ['Copywriting', 'Writing', 'copy sales ad copy slogan tagline'],
  ['Website content', 'Writing', 'website copy about page content'],
  ['Product descriptions', 'Writing', 'product description amazon ecommerce listing'],
  ['Resume and cover letter', 'Writing', 'resume cv cover letter linkedin profile'],
  ['Technical writing', 'Writing', 'technical documentation docs manual'],
  ['Proofreading and editing', 'Writing', 'proofread edit grammar rewrite'],
  ['Translation', 'Writing', 'translate translation hindi punjabi english'],
  ['Script writing', 'Writing', 'script screenplay youtube video script'],
  ['Newsletter writing', 'Writing', 'newsletter email copy'],
  ['Social media captions', 'Writing', 'caption hashtag instagram post'],
  ['Press release', 'Writing', 'press release pr news'],
  // Video
  ['YouTube video editing', 'Video', 'youtube video edit editing premiere'],
  ['Reels and Shorts editing', 'Video', 'reels shorts tiktok instagram edit'],
  ['Subtitles and captions', 'Video', 'subtitle captions srt transcription'],
  ['Motion graphics', 'Video', 'motion graphics after effects animation'],
  ['Logo animation and intro', 'Video', 'logo animation intro outro'],
  ['Explainer video', 'Video', 'explainer animated video whiteboard'],
  ['Podcast editing', 'Video', 'podcast audio edit mixing'],
  ['Wedding and event video', 'Video', 'wedding event highlight video'],
  ['Color grading', 'Video', 'color grading correction cinematic'],
  ['Voice-over', 'Video', 'voice over voiceover narration'],
  // Marketing
  ['Instagram ads', 'Marketing', 'instagram ads meta advertising'],
  ['Facebook ads', 'Marketing', 'facebook ads meta advertising'],
  ['Google Ads', 'Marketing', 'google ads ppc adwords search ads'],
  ['SEO optimization', 'Marketing', 'seo ranking google optimization backlinks'],
  ['Social media management', 'Marketing', 'social media manager instagram posting'],
  ['Email marketing', 'Marketing', 'email campaign mailchimp newsletter'],
  ['Influencer outreach', 'Marketing', 'influencer outreach collab promotion'],
  ['Content strategy', 'Marketing', 'content strategy plan calendar'],
  ['Lead generation', 'Marketing', 'leads lead generation sales funnel'],
  ['LinkedIn marketing', 'Marketing', 'linkedin b2b outreach'],
  ['YouTube channel growth', 'Marketing', 'youtube growth channel subscribers'],
  ['Market research', 'Marketing', 'market research survey competitor'],
  ['Analytics setup', 'Marketing', 'analytics google tag tracking pixel'],
];

export const CATALOG = RAW.map(([label, cat, kw]) => ({ label, cat, kw }));
export const POPULAR = ['Logo design', 'React website', 'Blog posts', 'YouTube video editing', 'Instagram ads', 'UI/UX design', 'SEO articles', 'WordPress website']
  .map((l) => CATALOG.find((c) => c.label === l));

export function suggest(q, max = 8) {
  const s = q.trim().toLowerCase();
  if (!s) return POPULAR;
  const words = s.split(/\s+/);
  return CATALOG.map((c) => {
    const label = c.label.toLowerCase();
    const hay = `${label} ${c.kw}`;
    if (!words.every((w) => hay.includes(w))) return { c, score: 0 };
    let score = words.length;
    if (label.startsWith(s)) score += 6;
    else if (label.includes(s)) score += 4;
    return { c, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.c);
}