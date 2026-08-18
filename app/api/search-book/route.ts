// app/api/search-book/route.ts

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

type SearchSource = "data4library" | "nationalLibrary" | "both";

type BookDoc = {
  bookname: string;
  authors: string;
  publisher: string;
  publication_year: string;
  isbn13: string;
  class_nm: string;
  bookImageURL?: string;
  loan_count?: string;
};

type Data4LibraryItem = {
  doc?: {
    bookname?: string;
    authors?: string;
    publisher?: string;
    publication_year?: string;
    isbn13?: string;
    class_nm?: string;
    bookImageURL?: string;
    loan_count?: string;
  };
};

type NationalLibraryItem = {
  title_info?: string;
  author_info?: string;
  pub_info?: string;
  pub_year_info?: string;
  isbn?: string;
  category?: string;
};

type SearchResult = {
  source: SearchSource;
  query: string;
  docs: BookDoc[];
  error?: string;
};

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeText(value: string) {
  return stripHtml(value)
    .trim()
    .toLowerCase()
    .replace(/[:：\-–—_/|()[\]{}「」『』《》〈〉,，.。!?！？=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noSpace(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function removeKoreanParticle(token: string) {
  return token.replace(/(은|는|이|가|을|를|의|에|에서|로|으로|와|과)$/g, "");
}

function cleanSearchToken(token: string) {
  return removeKoreanParticle(token)
    .replace(/(이라는|라는|이란|란)$/g, "")
    .trim();
}

function splitWords(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function buildSearchQueries(title: string, author: string) {
  const normalizedTitle = normalizeText(title);
  const normalizedAuthor = normalizeText(author);

  const titleWords = splitWords(title);

  const cleanedTitleWords = titleWords
    .map((word) => cleanSearchToken(word))
    .filter((word) => word.length >= 2);

  const cleanedTitle = cleanedTitleWords.join(" ");
  const firstTwo = cleanedTitleWords.slice(0, 2).join(" ");
  const firstThree = cleanedTitleWords.slice(0, 3).join(" ");

  const queries: string[] = [];

  if (normalizedTitle && normalizedAuthor) {
    queries.push(`${normalizedTitle} ${normalizedAuthor}`);
  }

  if (normalizedTitle) {
    queries.push(normalizedTitle);
    queries.push(noSpace(normalizedTitle));
  }

  if (cleanedTitle && cleanedTitle !== normalizedTitle) {
    queries.push(cleanedTitle);
    queries.push(noSpace(cleanedTitle));
  }

  if (firstThree) {
    queries.push(firstThree);
  }

  if (firstTwo) {
    queries.push(firstTwo);
  }

  if (!normalizedTitle && normalizedAuthor) {
    queries.push(normalizedAuthor);
  }

  return uniqueValues(queries)
    .filter((query) => query.length >= 2)
    .slice(0, 8);
}

function extractPublicationYear(value: string | undefined) {
  if (!value) return "";

  const match = value.match(/[0-9]{4}/);

  return match ? match[0] : "";
}

function convertIsbn10ToIsbn13(isbn10: string) {
  const body = `978${isbn10.slice(0, 9)}`;

  let sum = 0;

  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;

  return `${body}${checkDigit}`;
}

function extractIsbn13(value: string | undefined) {
  if (!value) return "";

  const candidates = String(value)
    .split(/[\s,;|/]+/)
    .map((item) => item.replace(/[^0-9Xx]/g, "").toUpperCase())
    .filter(Boolean);

  const isbn13 = candidates.find((item) => /^97[89][0-9]{10}$/.test(item));

  if (isbn13) {
    return isbn13;
  }

  const isbn10 = candidates.find((item) => /^[0-9]{9}[0-9X]$/.test(item));

  if (isbn10) {
    return convertIsbn10ToIsbn13(isbn10);
  }

  const compact = String(value).replace(/[^0-9Xx]/g, "").toUpperCase();
  const compactIsbn13 = compact.match(/97[89][0-9]{10}/)?.[0];

  return compactIsbn13 || "";
}

function convertData4LibraryBookToDoc(item: Data4LibraryItem): BookDoc | null {
  const doc = item.doc;

  if (!doc) return null;

  const isbn13 = extractIsbn13(doc.isbn13);

  if (!isbn13) return null;

  const bookname = stripHtml(String(doc.bookname || ""));

  if (!bookname) return null;

  return {
    bookname,
    authors: stripHtml(String(doc.authors || "")),
    publisher: stripHtml(String(doc.publisher || "")),
    publication_year: extractPublicationYear(String(doc.publication_year || "")),
    isbn13,
    class_nm: stripHtml(String(doc.class_nm || "도서관 정보나루 검색 결과")),
    bookImageURL: String(doc.bookImageURL || "").trim(),
    loan_count: String(doc.loan_count || "").trim(),
  };
}

function convertNationalLibraryBookToDoc(
  item: NationalLibraryItem
): BookDoc | null {
  const isbn13 = extractIsbn13(item.isbn);

  if (!isbn13) return null;

  const bookname = stripHtml(String(item.title_info || ""));

  if (!bookname) return null;

  return {
    bookname,
    authors: stripHtml(String(item.author_info || "")),
    publisher: stripHtml(String(item.pub_info || "")),
    publication_year: extractPublicationYear(String(item.pub_year_info || "")),
    isbn13,
    class_nm: stripHtml(String(item.category || "국립중앙도서관 검색 결과")),
    bookImageURL: "",
    loan_count: "",
  };
}

function titleMatchScore(bookname: string, queryTitle: string) {
  if (!queryTitle.trim()) return 1;

  const book = normalizeText(bookname);
  const query = normalizeText(queryTitle);

  const bookNoSpace = noSpace(bookname);
  const queryNoSpace = noSpace(queryTitle);

  if (book.includes(query)) return 1;
  if (bookNoSpace.includes(queryNoSpace)) return 1;

  const tokens = splitWords(queryTitle)
    .map((word) => cleanSearchToken(word))
    .filter((word) => word.length >= 2);

  if (tokens.length === 0) return 0;

  const matched = tokens.filter((token) => {
    return book.includes(token) || bookNoSpace.includes(noSpace(token));
  }).length;

  return matched / tokens.length;
}

function authorMatchScore(authors: string, queryAuthor: string) {
  if (!queryAuthor.trim()) return 1;

  const target = normalizeText(authors);
  const targetNoSpace = noSpace(authors);

  const query = normalizeText(queryAuthor);
  const queryNoSpace = noSpace(queryAuthor);

  if (target.includes(query)) return 1;
  if (targetNoSpace.includes(queryNoSpace)) return 1;

  const tokens = splitWords(queryAuthor).filter((word) => word.length >= 2);

  if (tokens.length === 0) return 0;

  const matched = tokens.filter((token) => {
    return target.includes(token) || targetNoSpace.includes(noSpace(token));
  }).length;

  return matched / tokens.length;
}

function scoreBooks(docs: BookDoc[], title: string, author: string) {
  return docs
    .map((doc) => {
      const titleScore = titleMatchScore(doc.bookname, title);
      const authorScore = authorMatchScore(doc.authors, author);

      return {
        doc,
        titleScore,
        authorScore,
        score: titleScore * 0.75 + authorScore * 0.25,
      };
    })
    .filter((item) => {
      const hasTitle = title.trim().length > 0;
      const hasAuthor = author.trim().length > 0;

      if (hasTitle && hasAuthor) {
        return item.titleScore >= 0.2 && item.authorScore >= 0.1;
      }

      if (hasTitle) {
        return item.titleScore >= 0.2;
      }

      if (hasAuthor) {
        return item.authorScore >= 0.1;
      }

      return false;
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;

      if (scoreDiff !== 0) return scoreDiff;

      const loanA = Number(a.doc.loan_count || 0);
      const loanB = Number(b.doc.loan_count || 0);

      return loanB - loanA;
    })
    .map((item) => item.doc);
}

function mergeBooks(results: SearchResult[]) {
  const bookMap = new Map<string, BookDoc>();

  for (const result of results) {
    for (const doc of result.docs) {
      const existing = bookMap.get(doc.isbn13);

      if (!existing) {
        bookMap.set(doc.isbn13, doc);
        continue;
      }

      bookMap.set(doc.isbn13, {
        ...existing,
        ...doc,
        bookImageURL: existing.bookImageURL || doc.bookImageURL,
        loan_count: existing.loan_count || doc.loan_count,
        class_nm: existing.class_nm || doc.class_nm,
      });
    }
  }

  return Array.from(bookMap.values());
}

async function fetchData4LibraryBooks(query: string): Promise<SearchResult> {
  try {
    const apiUrl = new URL("https://data4library.kr/api/srchBooks");

    apiUrl.searchParams.set("authKey", env.DATA4LIBRARY_API_KEY);
    apiUrl.searchParams.set("keyword", query);
    apiUrl.searchParams.set("pageNo", "1");
    apiUrl.searchParams.set("pageSize", "30");
    apiUrl.searchParams.set("format", "json");

    const response = await fetch(apiUrl.toString(), {
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        source: "data4library",
        query,
        docs: [],
        error: `도서관 정보나루 API 실패: ${response.status} ${responseText}`,
      };
    }

    const data = JSON.parse(responseText);
    const items = (data?.response?.docs || []) as Data4LibraryItem[];

    const docs = items
      .map((item) => convertData4LibraryBookToDoc(item))
      .filter((doc): doc is BookDoc => doc !== null);

    return {
      source: "data4library",
      query,
      docs,
    };
  } catch (error) {
    return {
      source: "data4library",
      query,
      docs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectNationalLibraryItems(data: any): NationalLibraryItem[] {
  const items: NationalLibraryItem[] = [];

  function walk(value: any) {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }

    if (typeof value === "object") {
      const maybeItem = value as NationalLibraryItem;

      if (
        maybeItem.title_info ||
        maybeItem.author_info ||
        maybeItem.pub_info ||
        maybeItem.pub_year_info ||
        maybeItem.isbn
      ) {
        items.push(maybeItem);
      }

      for (const child of Object.values(value)) {
        walk(child);
      }
    }
  }

  walk(data);

  return items;
}

function getXmlTag(block: string, tag: string) {
  const match = block.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  );

  return match ? stripHtml(match[1]) : "";
}

function parseNationalLibraryXml(xml: string): NationalLibraryItem[] {
  const blocks = [
    ...xml.matchAll(/<(item|doc|record)[^>]*>([\s\S]*?)<\/\1>/gi),
  ].map((match) => match[2]);

  return blocks
    .map((block) => ({
      title_info: getXmlTag(block, "title_info"),
      author_info: getXmlTag(block, "author_info"),
      pub_info: getXmlTag(block, "pub_info"),
      pub_year_info: getXmlTag(block, "pub_year_info"),
      isbn: getXmlTag(block, "isbn"),
      category: getXmlTag(block, "category"),
    }))
    .filter((item) => item.title_info || item.isbn);
}

async function fetchNationalLibraryBooks(
  query: string
): Promise<SearchResult> {
  if (!env.NATIONAL_LIBRARY_API_KEY) {
    return {
      source: "nationalLibrary",
      query,
      docs: [],
      error: "국립중앙도서관 API 키가 설정되지 않았습니다.",
    };
  }

  try {
    const apiUrl = new URL(
      "https://www.nl.go.kr/NL/search/openApi/searchKolisNet.do"
    );

    apiUrl.searchParams.set("key", env.NATIONAL_LIBRARY_API_KEY);
    apiUrl.searchParams.set("srchTarget", "total");
    apiUrl.searchParams.set("kwd", query);
    apiUrl.searchParams.set("pageNum", "1");
    apiUrl.searchParams.set("pageSize", "30");
    apiUrl.searchParams.set("apiType", "json");

    const response = await fetch(apiUrl.toString(), {
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        source: "nationalLibrary",
        query,
        docs: [],
        error: `국립중앙도서관 API 실패: ${response.status} ${responseText}`,
      };
    }

    let items: NationalLibraryItem[] = [];

    try {
      const data = JSON.parse(responseText);
      items = collectNationalLibraryItems(data);
    } catch {
      items = parseNationalLibraryXml(responseText);
    }

    const docs = items
      .map((item) => convertNationalLibraryBookToDoc(item))
      .filter((doc): doc is BookDoc => doc !== null);

    return {
      source: "nationalLibrary",
      query,
      docs,
    };
  } catch (error) {
    return {
      source: "nationalLibrary",
      query,
      docs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getValidSearchSource(value: string | null): SearchSource {
  if (
    value === "data4library" ||
    value === "nationalLibrary" ||
    value === "both"
  ) {
    return value;
  }

  return "both";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") || "";
  const author = searchParams.get("author") || "";
  const source = getValidSearchSource(searchParams.get("source"));

  if (!title.trim() && !author.trim()) {
    return NextResponse.json(
      { error: "책 제목 또는 저자를 입력해주세요." },
      { status: 400 }
    );
  }

  const queries = buildSearchQueries(title, author);

  if (queries.length === 0) {
    return NextResponse.json(
      { error: "검색어가 비어 있습니다." },
      { status: 400 }
    );
  }

  try {
    const tasks: Promise<SearchResult>[] = [];

    if (source === "data4library" || source === "both") {
      tasks.push(...queries.map((query) => fetchData4LibraryBooks(query)));
    }

    if (source === "nationalLibrary" || source === "both") {
      tasks.push(...queries.map((query) => fetchNationalLibraryBooks(query)));
    }

    const results = await Promise.all(tasks);

    const finalDocs = scoreBooks(mergeBooks(results), title, author).slice(
      0,
      20
    );

    return NextResponse.json({
      response: {
        docs: finalDocs.map((doc) => ({
          doc,
        })),
        numFound: finalDocs.length,
      },
      searchSource: source,
      searchCondition: {
        title,
        author,
        source,
        queries,
      },
      failedQueries: results
        .filter((result) => result.error)
        .map((result) => ({
          source: result.source,
          query: result.query,
          error: result.error,
        })),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "책 검색 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}