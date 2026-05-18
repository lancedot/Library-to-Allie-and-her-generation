from __future__ import annotations

import html
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR = ROOT / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = DOWNLOAD_DIR / "ai-native-work-handbook.pdf"
PAGE_BG = colors.HexColor("#F7F5EF")
TEXT = colors.HexColor("#24211B")
MUTED = colors.HexColor("#746D60")
LINE = colors.HexColor("#DED7C8")
ACCENT = colors.HexColor("#206A5D")
ACCENT_SOFT = colors.HexColor("#E3F1EB")


def register_fonts() -> tuple[str, str]:
    regular = Path(r"C:\Windows\Fonts\simsun.ttc")
    bold = Path(r"C:\Windows\Fonts\simhei.ttf")
    fallback_regular = Path(r"C:\Windows\Fonts\Deng.ttf")
    fallback_bold = Path(r"C:\Windows\Fonts\Dengb.ttf")

    regular_font = regular if regular.exists() else fallback_regular
    bold_font = bold if bold.exists() else fallback_bold

    pdfmetrics.registerFont(TTFont("BookCN", str(regular_font)))
    pdfmetrics.registerFont(TTFont("BookCN-Bold", str(bold_font)))
    return "BookCN", "BookCN-Bold"


FONT, FONT_BOLD = register_fonts()


def wildcard_to_regex(pattern: str) -> re.Pattern[str]:
    escaped = re.escape(pattern).replace(r"\*", ".*").replace(r"\?", ".")
    return re.compile("^" + escaped + "$", re.I)


def chapter_number(file_name: str, fallback: int) -> int:
    display_name = Path(file_name).name
    match = re.search(r"(?:^|[_-])Ch(?:apter)?(\d+)", display_name, re.I) or re.search(r"(\d+)", display_name)
    return int(match.group(1)) if match else fallback


def chinese_number(value: int) -> str:
    digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    if value <= 10:
        return "十" if value == 10 else digits[value]
    if value < 20:
        return "十" + digits[value - 10]
    tens, ones = divmod(value, 10)
    return digits[tens] + "十" + (digits[ones] if ones else "")


def source_files(source: dict) -> list[str]:
    all_files = [path.name for path in ROOT.iterdir() if path.suffix.lower() == ".md"]
    patterns = source.get("files")
    if not isinstance(patterns, list):
        patterns = [patterns]
    if all(pattern and "*" not in pattern and "?" not in pattern for pattern in patterns):
        return [pattern for pattern in patterns if (ROOT / pattern).exists()]

    matched: set[str] = set()
    for pattern in patterns:
        if not pattern:
            continue
        if "*" in pattern or "?" in pattern:
            matcher = wildcard_to_regex(pattern)
            matched.update(name for name in all_files if matcher.match(name))
        elif (ROOT / pattern).exists():
            matched.add(pattern)

    return sorted(matched, key=lambda name: (chapter_number(name, 0), name))


def chapter_title(book: dict, source: dict, file_name: str, markdown: str, fallback: str) -> str:
    h1 = [item.strip() for item in re.findall(r"^#\s+(.+)$", markdown, re.M)]
    h2 = [item.strip() for item in re.findall(r"^##\s+(.+)$", markdown, re.M)]
    excludes = {book.get("title", ""), *source.get("titleExcludes", [])}
    for item in h1:
        if not any(exclude and exclude in item for exclude in excludes):
            return item
    for item in h2:
        if not item.startswith("Part "):
            return item
    return fallback


def display_title(source: dict, file_name: str, title: str, global_chapter: int) -> str:
    display_name = Path(file_name).name
    if int(source.get("chapterOffset", 0)) > 0 and not re.search(r"Appendix[_-]?[A-Z]", display_name, re.I):
        return re.sub(r"^第[一二三四五六七八九十]+章([：:])", f"第{chinese_number(global_chapter)}章\\1", title)
    return title


def chapter_labels(file_name: str, global_chapter: int) -> tuple[str, str]:
    display_name = Path(file_name).name
    appendix = re.search(r"Appendix[_-]?([A-Z])", display_name, re.I)
    if re.search(r"Introduction", display_name, re.I):
        return "引", "引言"
    if re.search(r"Preface", display_name, re.I):
        return "序", "序言"
    if appendix:
        letter = appendix.group(1).upper()
        return letter, f"附录 {letter}"
    return str(global_chapter), f"第 {global_chapter} 章"


def load_chapters() -> tuple[dict, list[dict]]:
    config = json.loads((ROOT / "books.config.json").read_text(encoding="utf-8"))
    book = config["books"][0]
    chapters: list[dict] = []
    for source_index, source in enumerate(book.get("sources", []), start=1):
        for file_index, file_name in enumerate(source_files(source), start=1):
            markdown = (ROOT / file_name).read_text(encoding="utf-8")
            raw_chapter = re.search(r"(?:^|[_-])Ch(?:apter)?(\d+)", file_name, re.I)
            chapter_in_part = int(raw_chapter.group(1)) if raw_chapter else file_index
            global_chapter = int(source.get("chapterOffset", 0)) + chapter_in_part
            title = chapter_title(book, source, file_name, markdown, Path(file_name).name.removesuffix(".md"))
            number_label, meta_label = chapter_labels(file_name, global_chapter)
            chapters.append(
                {
                    "id": f"chapter-{source_index}-{chapter_in_part}",
                    "file_name": file_name,
                    "part_title": source.get("part") or source.get("title") or f"Part {source_index}",
                    "global_chapter": global_chapter,
                    "number_label": number_label,
                    "meta_label": meta_label,
                    "title": display_title(source, file_name, title, global_chapter),
                    "markdown": markdown,
                }
            )
    chapters.sort(key=lambda item: (item["global_chapter"], item["file_name"]))
    return book, chapters


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        "CoverKicker",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=12,
        leading=18,
        textColor=colors.HexColor("#206A5D"),
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName=FONT_BOLD,
        fontSize=30,
        leading=42,
        alignment=TA_CENTER,
        textColor=TEXT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "CoverBody",
        parent=styles["Normal"],
        fontName=FONT,
        fontSize=13,
        leading=24,
        alignment=TA_CENTER,
        textColor=MUTED,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "ChapterKicker",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=10.5,
        leading=16,
        textColor=ACCENT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "BookH1",
        parent=styles["Heading1"],
        fontName=FONT_BOLD,
        fontSize=24,
        leading=34,
        spaceBefore=0,
        spaceAfter=10,
        textColor=TEXT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "BookH2",
        parent=styles["Heading2"],
        fontName=FONT_BOLD,
        fontSize=18,
        leading=29,
        spaceBefore=17,
        spaceAfter=9,
        textColor=TEXT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "BookH3",
        parent=styles["Heading3"],
        fontName=FONT_BOLD,
        fontSize=15,
        leading=25,
        spaceBefore=13,
        spaceAfter=7,
        textColor=ACCENT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "BookBody",
        parent=styles["BodyText"],
        fontName=FONT,
        fontSize=13,
        leading=24,
        firstLineIndent=22,
        spaceAfter=7,
        alignment=TA_JUSTIFY,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "BookList",
        parent=styles["BookBody"],
        firstLineIndent=0,
        leftIndent=14,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        "BookQuote",
        parent=styles["BodyText"],
        fontName=FONT,
        fontSize=12.5,
        leading=23,
        leftIndent=14,
        rightIndent=10,
        spaceBefore=8,
        spaceAfter=10,
        textColor=colors.HexColor("#3C443F"),
        backColor=ACCENT_SOFT,
        borderColor=colors.HexColor("#B8D8CC"),
        borderWidth=0.6,
        borderPadding=6,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "TocTitle",
        parent=styles["Heading1"],
        fontName=FONT_BOLD,
        fontSize=20,
        leading=30,
        textColor=ACCENT,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "TocPart",
        parent=styles["Heading2"],
        fontName=FONT_BOLD,
        fontSize=12,
        leading=20,
        spaceBefore=11,
        spaceAfter=5,
        textColor=MUTED,
        wordWrap="CJK",
    )
)
styles.add(
    ParagraphStyle(
        "TocRow",
        parent=styles["Normal"],
        fontName=FONT,
        fontSize=11,
        leading=17,
        textColor=TEXT,
        wordWrap="CJK",
    )
)


def clean_heading(text: str) -> str:
    return text.replace("❌", "").strip()


def inline_markup(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<font name='BookCN-Bold'>\1</font>", escaped)
    escaped = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", escaped)
    return escaped


def para(text: str, style_name: str = "BookBody") -> Paragraph:
    return Paragraph(inline_markup(text), styles[style_name])


class BookDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        bookmark_name = getattr(flowable, "_bookmark_name", None)
        if not bookmark_name:
            return
        title = getattr(flowable, "_toc_title", "")
        level = getattr(flowable, "_toc_level", 0)
        self.canv.bookmarkPage(bookmark_name)
        self.canv.addOutlineEntry(title, bookmark_name, level=level, closed=False)
        self.notify("TOCEntry", (level, title, self.page, bookmark_name))


def chapter_anchor(chapter: dict) -> Paragraph:
    title = f"{chapter['part_title']} · {chapter['meta_label']}"
    paragraph = Paragraph(html.escape(title), styles["ChapterKicker"])
    paragraph._bookmark_name = chapter["id"]
    paragraph._toc_title = f"{chapter['number_label']} {chapter['title']}"
    paragraph._toc_level = 0
    return paragraph


def flush_paragraph(story: list, paragraph: list[str]) -> None:
    if paragraph:
        story.append(para(" ".join(paragraph)))
        paragraph.clear()


def flush_list(story: list, items: list[str], list_type: str | None) -> None:
    if not items:
        return
    for index, item in enumerate(items, start=1):
        prefix = f"{index}. " if list_type == "ol" else "- "
        story.append(Paragraph(inline_markup(prefix + item), styles["BookList"]))
    story.append(Spacer(1, 3))
    items.clear()


def table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(cells: list[str]) -> bool:
    return all(re.match(r"^:?-{3,}:?$", cell) for cell in cells)


def flush_table(story: list, rows: list[str], width: float) -> None:
    if not rows:
        return
    parsed = [table_cells(row) for row in rows]
    has_header = len(parsed) > 1 and is_separator(parsed[1])
    body = [parsed[0]] + parsed[2:] if has_header else parsed
    max_cols = max(len(row) for row in body)
    table_data = []
    for row_index, row in enumerate(body):
        style_name = "BookH3" if has_header and row_index == 0 else "BookBody"
        padded = row + [""] * (max_cols - len(row))
        table_data.append([Paragraph(inline_markup(cell), styles[style_name]) for cell in padded])
    table = Table(table_data, colWidths=[width / max_cols] * max_cols, hAlign="LEFT", repeatRows=1 if has_header else 0)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8D1C4")),
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SOFT if has_header else PAGE_BG),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 7))
    rows.clear()


def markdown_to_flowables(markdown: str, width: float) -> list:
    story: list = []
    paragraph: list[str] = []
    list_items: list[str] = []
    list_type: str | None = None
    table_rows: list[str] = []

    def flush_all() -> None:
        flush_paragraph(story, paragraph)
        flush_list(story, list_items, list_type)
        flush_table(story, table_rows, width)

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            flush_all()
            list_type = None
            continue

        if re.match(r"^---+$", line):
            flush_all()
            story.append(HRFlowable(width="100%", color=LINE, thickness=0.6, spaceBefore=10, spaceAfter=10))
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", line)
        if heading:
            flush_all()
            level = min(len(heading.group(1)), 3)
            story.append(Paragraph(inline_markup(clean_heading(heading.group(2))), styles[f"BookH{level}"]))
            continue

        if line.startswith(">"):
            flush_all()
            story.append(Paragraph(inline_markup(line.lstrip(">").strip()), styles["BookQuote"]))
            continue

        if line.startswith("|") and line.endswith("|"):
            flush_paragraph(story, paragraph)
            flush_list(story, list_items, list_type)
            list_type = None
            table_rows.append(line)
            continue

        unordered = re.match(r"^[-*]\s+(.+)$", line)
        ordered = re.match(r"^\d+\.\s+(.+)$", line)
        if unordered or ordered:
            flush_paragraph(story, paragraph)
            flush_table(story, table_rows, width)
            current_type = "ol" if ordered else "ul"
            if list_type and list_type != current_type:
                flush_list(story, list_items, list_type)
            list_type = current_type
            list_items.append((ordered or unordered).group(1))
            continue

        flush_table(story, table_rows, width)
        paragraph.append(line)

    flush_all()
    return story


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.HexColor("#8A8276"))
    canvas.drawCentredString(A4[0] / 2, 10 * mm, str(doc.page))
    canvas.restoreState()


def build_pdf() -> None:
    book, chapters = load_chapters()
    doc = BookDocTemplate(
        str(OUT_FILE),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=17 * mm,
        bottomMargin=17 * mm,
        title=book["title"],
        author=book.get("author", "Alex Liu"),
    )
    width = doc.width
    story: list = []

    story.append(Spacer(1, 58 * mm))
    story.append(Paragraph("AI Native Work Handbook", styles["CoverKicker"]))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(html.escape(book["title"]), styles["CoverTitle"]))
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph(html.escape(book.get("author", "Alex Liu")), styles["CoverBody"]))
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(html.escape(book.get("description", "")), styles["CoverBody"]))
    story.append(PageBreak())

    story.append(Paragraph("目录", styles["TocTitle"]))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TocEntry",
            parent=styles["TocRow"],
            fontName=FONT,
            fontSize=11,
            leading=18,
            leftIndent=0,
            firstLineIndent=0,
            rightIndent=18,
            textColor=TEXT,
            wordWrap="CJK",
        )
    ]
    story.append(toc)
    story.append(PageBreak())

    for index, chapter in enumerate(chapters):
        if index:
            story.append(PageBreak())
        story.append(chapter_anchor(chapter))
        story.extend(markdown_to_flowables(chapter["markdown"], width))

    doc.multiBuild(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    build_pdf()
