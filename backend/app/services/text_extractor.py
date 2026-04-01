"""
Text Extractor — extracts readable text from various file formats.

Supported:
  - .pdf  → PyMuPDF (fitz) for accurate page-by-page extraction
  - .csv  → csv module (convert to readable table text)
  - .json → json module (pretty-print)
  - Plain text (.txt, .md, .py, .js, .ts, .html, .css, .yaml, .yml, .xml, .log)
"""

import json
import csv
import io
import logging
from pathlib import Path

logger = logging.getLogger("text_extractor")

# Track PyMuPDF availability
_FITZ_AVAILABLE = False
try:
    import fitz  # PyMuPDF
    _FITZ_AVAILABLE = True
except ImportError:
    logger.warning(
        "PyMuPDF not installed. PDF text extraction will be unavailable. "
        "Install with: pip install PyMuPDF"
    )

# Plain-text file extensions (decoded as UTF-8 directly)
_PLAIN_TEXT_EXTS = {
    ".txt", ".md", ".py", ".js", ".ts", ".html", ".css",
    ".yaml", ".yml", ".xml", ".log",
}


def extract_text(file_bytes: bytes, filename: str) -> str:
    """
    Extract human-readable text from a file.

    Args:
        file_bytes: Raw file content as bytes
        filename:   Original filename (used to determine type)

    Returns:
        Extracted text content as a string.
        Returns empty string if extraction fails.
    """
    ext = Path(filename).suffix.lower()

    try:
        if ext == ".pdf":
            return _extract_pdf(file_bytes)
        elif ext == ".csv":
            return _extract_csv(file_bytes)
        elif ext == ".json":
            return _extract_json(file_bytes)
        elif ext in _PLAIN_TEXT_EXTS:
            return file_bytes.decode("utf-8", errors="ignore")
        else:
            # Unknown type — attempt UTF-8 decode as best-effort
            return file_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        logger.error(f"Text extraction failed for '{filename}': {exc}")
        return ""


def _extract_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF using PyMuPDF (fitz)."""
    if not _FITZ_AVAILABLE:
        logger.warning("Cannot extract PDF text: PyMuPDF not installed")
        return "[PDF text extraction unavailable — install PyMuPDF]"

    pages_text = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            if text and text.strip():
                pages_text.append(f"--- Page {page_num + 1} ---\n{text.strip()}")
        doc.close()
    except Exception as exc:
        logger.error(f"PyMuPDF extraction error: {exc}")
        return ""

    if not pages_text:
        return "[PDF contains no extractable text — possibly scanned/image-based]"

    return "\n\n".join(pages_text)


def _extract_csv(file_bytes: bytes) -> str:
    """Convert CSV to a readable text table."""
    text = file_bytes.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return ""

    # Format as a readable text representation
    lines = []
    header = rows[0] if rows else []
    lines.append(" | ".join(header))
    lines.append("-" * len(lines[0]))
    for row in rows[1:]:
        lines.append(" | ".join(row))

    return "\n".join(lines)


def _extract_json(file_bytes: bytes) -> str:
    """Pretty-print JSON content."""
    text = file_bytes.decode("utf-8", errors="ignore")
    try:
        data = json.loads(text)
        return json.dumps(data, indent=2, ensure_ascii=False)
    except json.JSONDecodeError:
        return text  # Return raw if invalid JSON
