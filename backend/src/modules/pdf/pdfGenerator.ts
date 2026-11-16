import { PDFDocument, StandardFonts, rgb, RGB } from 'pdf-lib';

export interface ResumeContactInfo {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
}

export interface ResumeExperienceItem {
  title?: string | null;
  company?: string | null;
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  bullets?: string[];
}

export interface ResumeProjectItem {
  title?: string | null;
  description?: string | null;
  bullets?: string[];
  date?: string | null;
  link?: string | null;
}

export interface ResumeEducationItem {
  degree?: string | null;
  institution?: string | null;
  year?: string | null;
  raw?: string | null;
  field?: string | null;
}

export interface StructuredResumeData {
  contactInfo?: ResumeContactInfo;
  summary?: string | null;
  skills?: string[] | { category: string; skills: string[] }[];
  experience?: ResumeExperienceItem[];
  projects?: ResumeProjectItem[];
  education?: ResumeEducationItem[];
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89; // A4
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

// Professional ATS Colors
const COLOR_PRIMARY = rgb(0.12, 0.22, 0.35); // Deep navy for headers
const COLOR_TEXT = rgb(0.15, 0.15, 0.15); // Soft charcoal for body
const COLOR_MUTED = rgb(0.4, 0.45, 0.5); // Slate for dates/subtitles
const COLOR_RULE = rgb(0.82, 0.85, 0.88); // Light divider

/**
 * Direct unicode symbol and character mapping table.
 * Maps non-WinAnsi or problematic characters to clean ASCII / Latin-1 equivalents.
 */
const UNICODE_CHAR_REPLACEMENTS: Record<string, string> = {
  // Smart quotes and apostrophes
  '\u2018': "'", // ‘
  '\u2019': "'", // ’
  '\u201A': "'", // ‚
  '\u201B': "'", // ‛
  '\u201C': '"', // “
  '\u201D': '"', // ”
  '\u201E': '"', // „
  '\u201F': '"', // ‟
  '\u00AB': '"', // «
  '\u00BB': '"', // »
  '\u2039': "'", // ‹
  '\u203A': "'", // ›

  // Dashes, hyphens and bars
  '\u2013': '-', // – en-dash
  '\u2014': ' - ', // — em-dash
  '\u2015': ' - ', // ― horizontal bar
  '\u2212': '-', // − minus sign
  '\u2010': '-', // ‐ hyphen
  '\u2011': '-', // ‑ non-breaking hyphen
  '\u2012': '-', // ‒ figure dash

  // List bullets and shapes
  '\u2022': '•', // • bullet
  '\u2023': '>', // ‣ triangular bullet
  '\u25E6': '*', // ◦ white bullet
  '\u2043': '-', // ⁃ hyphen bullet
  '\u2219': '*', // ∙ bullet operator
  '\u25CF': '*', // ● black circle
  '\u25CB': '*', // ○ white circle
  '\u25A0': '*', // ■ black square
  '\u25A1': '*', // □ white square
  '\u25AA': '*', // ▪ black small square
  '\u25AB': '*', // ▫ white small square
  '\u25B6': '>', // ▶ black right-pointing triangle
  '\u25B8': '>', // ▸ black right-pointing small triangle
  '\u25BA': '>', // ► black right-pointing pointer
  '\u25BD': 'v', // ▽ white down-pointing triangle
  '\u25BC': 'v', // ▼ black down-pointing triangle
  '\u25C6': '*', // ◆ black diamond
  '\u25C7': '*', // ◇ white diamond

  // Stars and checkmarks
  '\u2605': '*', // ★ black star
  '\u2606': '*', // ☆ white star
  '\u272A': '*', // ✪ circled white star
  '\u2726': '*', // ✦ four pointed black star
  '\u2727': '*', // ✧ four pointed white star
  '\u2713': '[x]', // ✓ check mark
  '\u2714': '[x]', // ✔ heavy check mark
  '\u2611': '[x]', // ☑ ballot box with check
  '\u2717': '[ ]', // ✗ ballot x
  '\u2718': '[ ]', // ✘ heavy ballot x
  '\u2715': 'x', // ✕ multiplication x
  '\u2716': 'x', // ✖ heavy multiplication x

  // Arrows
  '\u2192': '->', // →
  '\u2794': '->', // ➔
  '\u279C': '->', // ➜
  '\u2799': '->', // ➝
  '\u27A1': '->', // ➡
  '\u2190': '<-', // ←
  '\u2194': '<->', // ↔
  '\u21D2': '=>', // ⇒
  '\u21D4': '<=>', // ⇔

  // Math, symbols, currency
  '\u2026': '...', // …
  '\u2122': '(TM)', // ™
  '\u00A9': '(C)', // ©
  '\u00AE': '(R)', // ®
  '\u00B0': ' deg', // °
  '\u00B1': '+/-', // ±
  '\u2260': '!=', // ≠
  '\u2264': '<=', // ≤
  '\u2265': '>=', // ≥
  '\u00D7': 'x', // ×
  '\u00F7': '/', // ÷
  '\u2248': '~=', // ≈
  '\u221E': 'inf', // ∞
  '\u20AC': 'EUR', // €
  '\u00A3': 'GBP', // £
  '\u00A5': 'JPY', // ¥
  '\u20B9': 'INR', // ₹
  '\u20BD': 'RUB', // ₽
  '\u20BF': 'BTC', // ₿

  // Ligatures
  '\uFB01': 'fi', // ﬁ
  '\uFB02': 'fl', // ﬂ
  '\uFB03': 'ffi', // ﬃ
  '\uFB04': 'ffl', // ﬄ
};

// Set of code points that are directly encodable by WinAnsi in Helvetica
const WIN_ANSI_EXTRA_CODEPOINTS = new Set([
  0x20AC, // €
  0x201A, // ‚
  0x0192, // ƒ
  0x201E, // „
  0x2026, // …
  0x2020, // †
  0x2021, // ‡
  0x02C6, // ˆ
  0x2030, // ‰
  0x0160, // Š
  0x2039, // ‹
  0x0152, // Œ
  0x017D, // Ž
  0x2018, // ‘
  0x2019, // ’
  0x201C, // “
  0x201D, // ”
  0x2022, // •
  0x2013, // –
  0x2014, // —
  0x02DC, // ˜
  0x2122, // ™
  0x0161, // š
  0x203A, // ›
  0x0153, // œ
  0x017E, // ž
  0x0178, // Ÿ
]);

export function isWinAnsiEncodable(charCode: number): boolean {
  if (charCode >= 0x20 && charCode <= 0x7E) return true;
  if (charCode === 0x09 || charCode === 0x0A || charCode === 0x0D) return true;
  if (charCode >= 0xA0 && charCode <= 0xFF) return true;
  return WIN_ANSI_EXTRA_CODEPOINTS.has(charCode);
}

/**
 * Sanitizes input string to ensure it contains only characters encodable by Helvetica (WinAnsi).
 * Maps non-WinAnsi characters (e.g. ★, ✓, 🚀, smart quotes, non-Latin symbols) to clean ASCII/Latin-1 equivalents.
 */
export function sanitizePdfText(text: string | null | undefined): string {
  if (!text) return '';

  // 1. Strip emojis and extended pictographics
  let sanitized = text.replace(
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}]/gu,
    ''
  );

  // 2. Map known special symbols and smart punctuation
  sanitized = sanitized.replace(
    /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A\u2013\u2014\u2015\u2212\u2010\u2011\u2012\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB\u25A0\u25A1\u25AA\u25AB\u25B6\u25B8\u25BA\u25BD\u25BC\u25C6\u25C7\u2605\u2606\u272A\u2726\u2727\u2713\u2714\u2611\u2717\u2718\u2715\u2716\u2192\u2794\u279C\u2799\u27A1\u2190\u2194\u21D2\u21D4\u2026\u2122\u00A9\u00AE\u00B0\u00B1\u2260\u2264\u2265\u00D7\u00F7\u2248\u221E\u20AC\u00A3\u00A5\u20B9\u20BD\u20BF\uFB01\uFB02\uFB03\uFB04]/g,
    (ch) => UNICODE_CHAR_REPLACEMENTS[ch] || ch
  );

  // 3. Remove zero-width characters and normalize spaces
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  sanitized = sanitized.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  // 4. Normalize unicode characters (NFKD to decompose accents)
  // For any character that is still not in WinAnsi, fallback to clean ASCII or remove
  let result = '';
  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    if (isWinAnsiEncodable(code)) {
      result += sanitized[i];
    } else {
      // Try decomposing character
      const decomposed = sanitized[i].normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      let ok = true;
      for (let j = 0; j < decomposed.length; j++) {
        if (!isWinAnsiEncodable(decomposed.charCodeAt(j))) {
          ok = false;
          break;
        }
      }
      if (ok && decomposed.length > 0) {
        result += decomposed;
      } else {
        // Strip or replace unencodable character
        result += ' ';
      }
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const sanitized = sanitizePdfText(text);
  const clean = sanitized.replace(/[\r\n]+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = `${currentLine} ${word}`;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export async function generateResumePdf(data: StructuredResumeData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  function createPage() {
    const p = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const origDraw = p.drawText.bind(p);
    p.drawText = (text: string, options?: any) => origDraw(sanitizePdfText(text), options);
    return p;
  }

  let page = createPage();
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  function ensureSpace(neededHeight: number) {
    if (currentY - neededHeight < MARGIN_BOTTOM) {
      page = createPage();
      currentY = PAGE_HEIGHT - MARGIN_TOP;
    }
  }

  function drawSectionHeader(title: string) {
    ensureSpace(38);
    currentY -= 14;

    page.drawText(sanitizePdfText(title).toUpperCase(), {
      x: MARGIN_X,
      y: currentY,
      size: 11.5,
      font: fontBold,
      color: COLOR_PRIMARY,
    });
    currentY -= 4;

    // Subtle horizontal divider line
    page.drawLine({
      start: { x: MARGIN_X, y: currentY },
      end: { x: PAGE_WIDTH - MARGIN_X, y: currentY },
      thickness: 0.75,
      color: COLOR_RULE,
    });
    currentY -= 10;
  }

  // 1. Header & Contact Info
  const contact = data.contactInfo || {};
  const name = sanitizePdfText(contact.name || 'Candidate Name');
  const title = sanitizePdfText(contact.title || '');

  // Name
  ensureSpace(40);
  page.drawText(name, {
    x: MARGIN_X,
    y: currentY,
    size: 20,
    font: fontBold,
    color: COLOR_PRIMARY,
  });
  currentY -= 18;

  // Professional Title
  if (title) {
    page.drawText(title, {
      x: MARGIN_X,
      y: currentY,
      size: 12,
      font: fontOblique,
      color: COLOR_MUTED,
    });
    currentY -= 16;
  }

  // Contact details line (email, phone, location, links)
  const contactParts = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin,
    contact.github,
    contact.website,
  ].filter(Boolean) as string[];

  if (contactParts.length > 0) {
    const contactLine = contactParts.join('  •  ');
    const wrappedContact = wrapText(contactLine, CONTENT_WIDTH, fontRegular, 9);
    for (const line of wrappedContact) {
      ensureSpace(13);
      page.drawText(line, {
        x: MARGIN_X,
        y: currentY,
        size: 9,
        font: fontRegular,
        color: COLOR_MUTED,
      });
      currentY -= 13;
    }
  }
  currentY -= 6;

  // 2. Professional Summary
  if (data.summary && data.summary.trim()) {
    drawSectionHeader('Professional Summary');
    const summaryLines = wrapText(data.summary.trim(), CONTENT_WIDTH, fontRegular, 9.5);
    for (const line of summaryLines) {
      ensureSpace(14);
      page.drawText(line, {
        x: MARGIN_X,
        y: currentY,
        size: 9.5,
        font: fontRegular,
        color: COLOR_TEXT,
      });
      currentY -= 14;
    }
    currentY -= 4;
  }

  // 3. Technical Skills
  if (data.skills && (Array.isArray(data.skills) ? data.skills.length > 0 : false)) {
    drawSectionHeader('Technical Skills');

    const first = data.skills[0];
    if (typeof first === 'object' && first !== null && 'category' in first) {
      // Categorized skills
      const catList = data.skills as { category: string; skills: string[] }[];
      for (const item of catList) {
        const catLabel = `${sanitizePdfText(item.category)}: `;
        const catLabelWidth = fontBold.widthOfTextAtSize(catLabel, 9.5);
        const skillStr = (item.skills || []).join(', ');
        const wrapped = wrapText(skillStr, CONTENT_WIDTH - catLabelWidth, fontRegular, 9.5);

        ensureSpace(14 * Math.max(1, wrapped.length));
        page.drawText(catLabel, {
          x: MARGIN_X,
          y: currentY,
          size: 9.5,
          font: fontBold,
          color: COLOR_PRIMARY,
        });

        if (wrapped.length > 0) {
          page.drawText(wrapped[0], {
            x: MARGIN_X + catLabelWidth,
            y: currentY,
            size: 9.5,
            font: fontRegular,
            color: COLOR_TEXT,
          });
          currentY -= 14;

          for (let i = 1; i < wrapped.length; i++) {
            ensureSpace(14);
            page.drawText(wrapped[i], {
              x: MARGIN_X + catLabelWidth,
              y: currentY,
              size: 9.5,
              font: fontRegular,
              color: COLOR_TEXT,
            });
            currentY -= 14;
          }
        } else {
          currentY -= 14;
        }
      }
    } else {
      // Flat list of skills
      const skillStrings = (data.skills as string[]).filter(Boolean);
      const skillText = skillStrings.join('  •  ');
      const lines = wrapText(skillText, CONTENT_WIDTH, fontRegular, 9.5);
      for (const line of lines) {
        ensureSpace(14);
        page.drawText(line, {
          x: MARGIN_X,
          y: currentY,
          size: 9.5,
          font: fontRegular,
          color: COLOR_TEXT,
        });
        currentY -= 14;
      }
    }
    currentY -= 4;
  }

  // 4. Professional Experience
  if (data.experience && data.experience.length > 0) {
    drawSectionHeader('Professional Experience');

    for (const exp of data.experience) {
      ensureSpace(32);

      const role = sanitizePdfText(exp.title || 'Role');
      const company = sanitizePdfText(exp.company || '');
      const date = sanitizePdfText(exp.date || [exp.startDate, exp.endDate].filter(Boolean).join(' - '));

      // Role and Date line
      page.drawText(role, {
        x: MARGIN_X,
        y: currentY,
        size: 10.5,
        font: fontBold,
        color: COLOR_TEXT,
      });

      if (date) {
        const dateWidth = fontRegular.widthOfTextAtSize(date, 9);
        page.drawText(date, {
          x: PAGE_WIDTH - MARGIN_X - dateWidth,
          y: currentY,
          size: 9,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      }
      currentY -= 14;

      // Company line
      if (company) {
        page.drawText(company, {
          x: MARGIN_X,
          y: currentY,
          size: 9.5,
          font: fontOblique,
          color: COLOR_PRIMARY,
        });
        currentY -= 14;
      }

      // Description or Bullets
      const bullets = exp.bullets && exp.bullets.length > 0
        ? exp.bullets
        : exp.description
          ? exp.description.split('\n').map(s => s.trim()).filter(Boolean)
          : [];

      for (const bullet of bullets) {
        const bulletText = bullet.replace(/^[•\-\*]\s*/, '').trim();
        const bulletLines = wrapText(bulletText, CONTENT_WIDTH - 14, fontRegular, 9);

        if (bulletLines.length > 0) {
          ensureSpace(13 * bulletLines.length);

          // Draw bullet dot
          page.drawText('•', {
            x: MARGIN_X + 2,
            y: currentY,
            size: 9,
            font: fontBold,
            color: COLOR_PRIMARY,
          });

          page.drawText(bulletLines[0], {
            x: MARGIN_X + 14,
            y: currentY,
            size: 9,
            font: fontRegular,
            color: COLOR_TEXT,
          });
          currentY -= 13;

          for (let i = 1; i < bulletLines.length; i++) {
            page.drawText(bulletLines[i], {
              x: MARGIN_X + 14,
              y: currentY,
              size: 9,
              font: fontRegular,
              color: COLOR_TEXT,
            });
            currentY -= 13;
          }
        }
      }
      currentY -= 6;
    }
    currentY -= 4;
  }

  // 5. Selected Projects
  if (data.projects && data.projects.length > 0) {
    drawSectionHeader('Selected Projects');

    for (const proj of data.projects) {
      ensureSpace(28);

      const title = sanitizePdfText(proj.title || 'Project');
      const date = sanitizePdfText(proj.date || '');

      page.drawText(title, {
        x: MARGIN_X,
        y: currentY,
        size: 10,
        font: fontBold,
        color: COLOR_TEXT,
      });

      if (date) {
        const dateWidth = fontRegular.widthOfTextAtSize(date, 9);
        page.drawText(date, {
          x: PAGE_WIDTH - MARGIN_X - dateWidth,
          y: currentY,
          size: 9,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      }
      currentY -= 14;

      const bullets = proj.bullets && proj.bullets.length > 0
        ? proj.bullets
        : proj.description
          ? proj.description.split('\n').map(s => s.trim()).filter(Boolean)
          : [];

      for (const bullet of bullets) {
        const bulletText = bullet.replace(/^[•\-\*]\s*/, '').trim();
        const bulletLines = wrapText(bulletText, CONTENT_WIDTH - 14, fontRegular, 9);

        if (bulletLines.length > 0) {
          ensureSpace(13 * bulletLines.length);

          page.drawText('•', {
            x: MARGIN_X + 2,
            y: currentY,
            size: 9,
            font: fontBold,
            color: COLOR_PRIMARY,
          });

          page.drawText(bulletLines[0], {
            x: MARGIN_X + 14,
            y: currentY,
            size: 9,
            font: fontRegular,
            color: COLOR_TEXT,
          });
          currentY -= 13;

          for (let i = 1; i < bulletLines.length; i++) {
            page.drawText(bulletLines[i], {
              x: MARGIN_X + 14,
              y: currentY,
              size: 9,
              font: fontRegular,
              color: COLOR_TEXT,
            });
            currentY -= 13;
          }
        }
      }
      currentY -= 6;
    }
    currentY -= 4;
  }

  // 6. Education & Certifications
  if (data.education && data.education.length > 0) {
    drawSectionHeader('Education & Certifications');

    for (const edu of data.education) {
      ensureSpace(24);

      const degree = sanitizePdfText(edu.degree || [edu.field, 'Degree'].filter(Boolean).join(' in ') || 'Degree');
      const institution = sanitizePdfText(edu.institution || '');
      const year = sanitizePdfText(edu.year || '');

      page.drawText(degree, {
        x: MARGIN_X,
        y: currentY,
        size: 10,
        font: fontBold,
        color: COLOR_TEXT,
      });

      if (year) {
        const yearWidth = fontRegular.widthOfTextAtSize(year, 9);
        page.drawText(year, {
          x: PAGE_WIDTH - MARGIN_X - yearWidth,
          y: currentY,
          size: 9,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      }
      currentY -= 13;

      if (institution) {
        page.drawText(institution, {
          x: MARGIN_X,
          y: currentY,
          size: 9,
          font: fontOblique,
          color: COLOR_PRIMARY,
        });
        currentY -= 13;
      }
      currentY -= 4;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
