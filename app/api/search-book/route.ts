import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

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

type SearchResult = {
  query: string;
  docs: BookDoc[];
  error?: string;
};

function normalizeText(value: string) {
  return value
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

function cleanSearchToken(token: string) {
  return removeKoreanParticle(token)
    .replace(/(이라는|라는|이란|란)$/g, "")
    .trim();
}

function buildSearchQueries(title: string, author: string) {
  const normalizedTitle = normalizeText(title);
  const normalizedAuthor = normalizeText(author);

  const titleWords = splitWords(title);

  const cleanedTitleWords = titleWords
    .map((word) => cleanSearchToken(word))
    .filter((word) => word.length >= 2);

  const cleanedTitle = cleanedTitleWords.join(" ");

  const longestWord = [...titleWords, ...cleanedTitleWords]
    .filter((word) => word.length >= 2)
    .sort((a, b) => b.length - a.length)[0];

  const firstTwo = cleanedTitleWords.slice(0, 2).join(" ");
  const lastTwo = cleanedTitleWords.slice(-2).join(" ");
  const firstThree = cleanedTitleWords.slice(0, 3).join(" ");

  const queries: string[] = [];

  // 1순위: 제목 + 저자
  if (normalizedTitle && normalizedAuthor) {
    queries.push(`${normalizedTitle} ${normalizedAuthor}`);
  }

  // 2순위: 제목 전체
  if (normalizedTitle) {
    queries.push(normalizedTitle);
    queries.push(noSpace(normalizedTitle));
  }

  // 3순위: 조사/어미 정리 제목
  if (cleanedTitle && cleanedTitle !== normalizedTitle) {
    queries.push(cleanedTitle);
    queries.push(noSpace(cleanedTitle));
  }

  // 4순위: 핵심 단어 조합
  if (firstThree) {
    queries.push(firstThree);
  }

  if (firstTwo) {
    queries.push(firstTwo);
  }

  if (lastTwo) {
    queries.push(lastTwo);
  }

  // 5순위: 핵심 단어 개별 검색
  if (cleanedTitleWords.length > 0) {
    queries.push(...cleanedTitleWords);
  }

  // 6순위: 가장 긴 단어
  if (longestWord) {
    queries.push(longestWord);
  }

  // 제목이 없고 저자만 있을 때
  if (!normalizedTitle && normalizedAuthor) {
    queries.push(normalizedAuthor);
  }

  return uniqueValues(queries)
    .filter((query) => query.length >= 2)
    .slice(0, 10);
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
      query,
      docs,
    };
  } catch (error) {
    return {
      query,
      docs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") || "";
  const author = searchParams.get("author") || "";

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
    const results = await Promise.all(
      queries.map((query) => fetchData4LibraryBooks(query))
    );

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
          class_nm: doc.class_nm || existing.class_nm,
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
        const hasTitle = title.trim().length > 0;
        const hasAuthor = author.trim().length > 0;

        if (hasTitle && hasAuthor) {
          return item.titleScore >= 0.2 && item.authorScore >= 0.15;
        }

        if (hasTitle) {
          return item.titleScore >= 0.2;
        }

        if (hasAuthor) {
          return item.authorScore >= 0.15;
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
      .slice(0, 20);

    return NextResponse.json({
      response: {
        docs: scoredBooks.map((item) => ({
          doc: item.doc,
        })),
        numFound: scoredBooks.length,
      },
      searchSource: "data4library",
      searchCondition: {
        title,
        author,
        source: "data4library",
        queries,
      },
      failedQueries: results
        .filter((result) => result.error)
        .map((result) => ({
          source: "data4library",
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