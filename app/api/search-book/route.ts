// app/api/search-book/route.ts

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

type SearchSource = "naver" | "data4library" | "both";

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

type NaverBookItem = {
  title?: string;
  link?: string;
  image?: string;
  author?: string;
  publisher?: string;
  pubdate?: string;
  isbn?: string;
  description?: string;
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

type SearchResult = {
  source: string;
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

  const strippedWords = titleWords
    .map((word) => removeKoreanParticle(word))
    .filter((word) => word.length >= 2);

  const longestWord = [...titleWords, ...strippedWords]
    .filter((word) => word.length >= 2)
    .sort((a, b) => b.length - a.length)[0];

  const firstTwo = titleWords.slice(0, 2).join(" ");
  const lastTwo = titleWords.slice(-2).join(" ");

  const queries: string[] = [];

  if (normalizedTitle && normalizedAuthor) {
    queries.push(`${normalizedTitle} ${normalizedAuthor}`);
  }

  if (normalizedTitle) {
    queries.push(normalizedTitle);
    queries.push(noSpace(normalizedTitle));
  }

  if (lastTwo) {
    queries.push(lastTwo);
  }

  if (longestWord) {
    queries.push(longestWord);
  }

  if (firstTwo) {
    queries.push(firstTwo);
  }

  if (!normalizedTitle && normalizedAuthor) {
    queries.push(normalizedAuthor);
  }

  return uniqueValues(queries)
    .filter((query) => query.length >= 2)
    .slice(0, 4);
}

function extractIsbn13(isbnText: string | undefined) {
  if (!isbnText) return "";

  const candidates = isbnText
    .split(/\s+/)
    .map((value) => value.replace(/[^0-9X]/gi, ""))
    .filter(Boolean);

  const isbn13 = candidates.find((value) => /^97[89][0-9]{10}$/.test(value));

  return isbn13 || "";
}

function getPublicationYear(pubdate: string | undefined) {
  if (!pubdate) return "";

  const onlyNumber = pubdate.replace(/[^0-9]/g, "");

  if (onlyNumber.length >= 4) {
    return onlyNumber.slice(0, 4);
  }

  return "";
}

function convertNaverBookToDoc(item: NaverBookItem): BookDoc | null {
  const isbn13 = extractIsbn13(item.isbn);

  if (!isbn13) return null;

  const title = stripHtml(item.title || "");
  const author = stripHtml(item.author || "");
  const publisher = stripHtml(item.publisher || "");

  if (!title) return null;

  return {
    bookname: title,
    authors: author,
    publisher,
    publication_year: getPublicationYear(item.pubdate),
    isbn13,
    class_nm: "네이버 책 검색 결과",
    bookImageURL: item.image || "",
    loan_count: "",
  };
}

function convertData4LibraryBookToDoc(item: Data4LibraryItem): BookDoc | null {
  const doc = item.doc;

  if (!doc) return null;

  const isbn13 = String(doc.isbn13 || "").trim();

  if (!isbn13) return null;

  const bookname = String(doc.bookname || "").trim();

  if (!bookname) return null;

  return {
    bookname,
    authors: String(doc.authors || "").trim(),
    publisher: String(doc.publisher || "").trim(),
    publication_year: String(doc.publication_year || "").trim(),
    isbn13,
    class_nm: String(doc.class_nm || "도서관 정보나루 검색 결과").trim(),
    bookImageURL: String(doc.bookImageURL || "").trim(),
    loan_count: String(doc.loan_count || "").trim(),
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
    .map((word) => removeKoreanParticle(word))
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

async function fetchNaverBooks(query: string): Promise<SearchResult> {
  try {
    const apiUrl = new URL("https://openapi.naver.com/v1/search/book.json");

    apiUrl.searchParams.set("query", query);
    apiUrl.searchParams.set("display", "20");
    apiUrl.searchParams.set("start", "1");
    apiUrl.searchParams.set("sort", "sim");

    const response = await fetch(apiUrl.toString(), {
      cache: "no-store",
      headers: {
        "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      return {
        source: "naver",
        query,
        docs: [],
        error: `네이버 책 검색 API 실패: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
    const items = (data.items || []) as NaverBookItem[];

    const docs = items
      .map((item) => convertNaverBookToDoc(item))
      .filter((doc): doc is BookDoc => doc !== null);

    return {
      source: "naver",
      query,
      docs,
    };
  } catch (error) {
    return {
      source: "naver",
      query,
      docs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

    if (!response.ok) {
      const errorText = await response.text();

      return {
        source: "data4library",
        query,
        docs: [],
        error: `도서관 정보나루 API 실패: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();
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

function getValidSearchSource(value: string | null): SearchSource {
  if (value === "naver" || value === "data4library" || value === "both") {
    return value;
  }

  return "naver";
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

    if (source === "naver" || source === "both") {
      tasks.push(...queries.map((query) => fetchNaverBooks(query)));
    }

    if (source === "data4library" || source === "both") {
      tasks.push(...queries.map((query) => fetchData4LibraryBooks(query)));
    }

    const results = await Promise.all(tasks);

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
          loan_count: doc.loan_count || existing.loan_count,
          class_nm:
            doc.class_nm && doc.class_nm !== "네이버 책 검색 결과"
              ? doc.class_nm
              : existing.class_nm,
        });
      }
    }

    const scoredBooks = Array.from(bookMap.values())
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
        const titleOk = title.trim() ? item.titleScore >= 0.25 : true;
        const authorOk = author.trim() ? item.authorScore >= 0.25 : true;

        return titleOk && authorOk;
      })
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;

        if (scoreDiff !== 0) return scoreDiff;

        const loanA = Number(a.doc.loan_count || 0);
        const loanB = Number(b.doc.loan_count || 0);

        return loanB - loanA;
      })
      .slice(0, 20);

    return NextResponse.json({
      response: {
        docs: scoredBooks.map((item) => ({
          doc: item.doc,
        })),
        numFound: scoredBooks.length,
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