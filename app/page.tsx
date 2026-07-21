"use client";

import { useEffect, useState } from "react";

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

type SearchBookItem = {
  doc: BookDoc;
};

type ScoreResult = {
  status: "OK";
  source?: string;
  book: {
    isbn13?: string;
    bookname?: string;
    classNm?: string;
  };
  targetCategory: string;
  score: {
    totalValidWeight: number;
    weightedScore: number;
    percentage: number;
    score30: number;
  };
  evaluations: {
    keyword: string;
    weight: number;
    relevance: string;
    multiplier: number;
    reason: string;
  }[];
};

const categories = [
  "정치/경제/사회",
  "과학/기술",
  "예술/문화",
  "심리/에세이",
  "인문/철학",
  "문학",
];

const searchSourceLabels: Record<SearchSource, string> = {
  naver: "네이버 책 검색",
  data4library: "도서관 정보나루",
  both: "둘 다 검색",
};

function getErrorMessage(data: any, fallback: string) {
  if (data?.detail) {
    return `${data.error || fallback}\n${data.detail}`;
  }

  if (data?.error) {
    return data.error;
  }

  return fallback;
}

function getBookSourceLabel(className: string) {
  if (className === "ISBN 직접 입력") {
    return "ISBN 직접 입력";
  }

  if (className === "네이버 책 검색 결과") {
    return "네이버";
  }

  if (className.includes("도서관 정보나루")) {
    return "정보나루";
  }

  return "정보나루";
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

function normalizeIsbnInput(value: string) {
  const cleaned = value.replace(/[^0-9Xx]/g, "").toUpperCase();

  if (/^97[89][0-9]{10}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^[0-9]{9}[0-9X]$/.test(cleaned)) {
    return convertIsbn10ToIsbn13(cleaned);
  }

  return "";
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbnInput, setIsbnInput] = useState("");
  const [searchSource, setSearchSource] = useState<SearchSource>("naver");

  const [books, setBooks] = useState<BookDoc[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookDoc | null>(null);

  const [targetCategory, setTargetCategory] = useState("정치/경제/사회");
  const [manualText, setManualText] = useState("");
  const [needsManualText, setNeedsManualText] = useState(false);

  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [loadingDots, setLoadingDots] = useState(".");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!loading) {
      setLoadingDots(".");
      return;
    }

    const timer = setInterval(() => {
      setLoadingDots((prev) => {
        if (prev === ".") return "..";
        if (prev === "..") return "...";
        return ".";
      });
    }, 500);

    return () => clearInterval(timer);
  }, [loading]);
  async function searchBooks() {
    if (!title.trim() && !author.trim()) {
      setMessage("책 제목 또는 저자를 입력해주세요.");
      return;
    }
    setLoadingLabel("책 검색 중");
    setLoading(true);
    setMessage("");
    setResult(null);
    setSelectedBook(null);
    setNeedsManualText(false);
    setManualText("");
    setBooks([]);

    try {
      const params = new URLSearchParams();

      if (title.trim()) {
        params.set("title", title.trim());
      }

      if (author.trim()) {
        params.set("author", author.trim());
      }

      params.set("source", searchSource);

      const response = await fetch(`/api/search-book?${params.toString()}`);

      const responseText = await response.text();

      let data: any = null;

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        setMessage(
          `책 검색 API가 JSON이 아닌 응답을 반환했습니다.\n상태 코드: ${
            response.status
          }\n응답 내용: ${responseText.slice(0, 500)}`
        );
        return;
      }

      if (!response.ok) {
        setMessage(getErrorMessage(data, "책 검색 중 오류가 발생했습니다."));
        return;
      }

      if (!data) {
        setMessage("책 검색 API 응답이 비어 있습니다.");
        return;
      }

      const docs: BookDoc[] =
        data?.response?.docs?.map((item: SearchBookItem) => item.doc) || [];

      setBooks(docs);

      if (docs.length === 0) {
        setMessage(
          "검색 결과가 없습니다. 검색 방식을 바꾸거나 책 제목/저자를 줄여서 다시 검색해보세요."
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("책 검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function selectBookByIsbn() {
    const isbn13 = normalizeIsbnInput(isbnInput);

    if (!isbn13) {
      setMessage(
        "올바른 ISBN을 입력해주세요. ISBN13 또는 ISBN10을 입력할 수 있습니다."
      );
      return;
    }

    const bookFromIsbn: BookDoc = {
      bookname: `ISBN 직접 입력 도서 (${isbn13})`,
      authors: "",
      publisher: "",
      publication_year: "",
      isbn13,
      class_nm: "ISBN 직접 입력",
      bookImageURL: "",
      loan_count: "",
    };

    setSelectedBook(bookFromIsbn);
    setBooks([]);
    setResult(null);
    setNeedsManualText(false);
    setManualText("");
    setMessage(
      "ISBN이 선택되었습니다. 분석 카테고리를 선택한 뒤 정보나루 키워드로 분석하세요."
    );
  }

  async function analyzeWithData4Library() {
    if (!selectedBook) {
      setMessage("분석할 책을 선택해주세요.");
      return;
    }
    setLoadingLabel("정보나루 키워드 및 AI 분석 중");
    setLoading(true);
    setMessage("");
    setResult(null);
    setNeedsManualText(false);

    try {
      const params = new URLSearchParams({
        isbn13: selectedBook.isbn13,
        bookname: selectedBook.bookname,
        classNm: selectedBook.class_nm || "",
        targetCategory,
      });

      const response = await fetch(`/api/target-score?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(
          getErrorMessage(
            data,
            "목표 카테고리 점수 계산 중 오류가 발생했습니다."
          )
        );
        return;
      }

      if (data.status === "NO_KEYWORDS") {
        setNeedsManualText(true);
        setMessage(
          "도서관 정보나루에 키워드 정보가 없습니다. 책 소개/목차/서문 일부를 직접 입력해주세요."
        );
        return;
      }

      if (data.status === "OK") {
        setResult(data);
        return;
      }

      setMessage(
        getErrorMessage(
          data,
          "목표 카테고리 점수 계산 중 오류가 발생했습니다."
        )
      );
    } catch (error) {
      console.error(error);
      setMessage("목표 카테고리 점수 계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeManualText() {
    if (!selectedBook) {
      setMessage("분석할 책을 선택해주세요.");
      return;
    }

    if (manualText.trim().length < 50) {
      setMessage("책 소개/목차/서문 일부를 조금 더 길게 입력해주세요.");
      return;
    }
    setLoadingLabel("입력 텍스트 AI 분석 중");
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/manual-score", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          bookname: selectedBook.bookname,
          targetCategory,
          manualText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          getErrorMessage(data, "수동 텍스트 분석 중 오류가 발생했습니다.")
        );
        return;
      }

      if (data.status === "OK") {
        setResult(data);
        return;
      }

      setMessage(
        getErrorMessage(data, "수동 텍스트 분석 중 오류가 발생했습니다.")
      );
    } catch (error) {
      console.error(error);
      setMessage("수동 텍스트 분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">
          글그사 도서 카테고리 적합도 분석
        </h1>

        <p className="mt-3 text-gray-600">
          책 제목, 저자, ISBN을 기준으로 도서를 찾고 선택한 카테고리에 대한
          적합도 점수를 계산합니다.
        </p>

        <section className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">1. 책 검색</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  searchBooks();
                }
              }}
              placeholder="책 제목 예: 왜 나는 너를"
              className="rounded-lg border px-4 py-2"
            />

            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  searchBooks();
                }
              }}
              placeholder="저자 예: 알랭 드 보통"
              className="rounded-lg border px-4 py-2"
            />

            <button
              onClick={searchBooks}
              disabled={loading}
              className="rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
            >
              검색
            </button>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium text-gray-700">검색 방식</div>

            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {(["naver", "data4library", "both"] as SearchSource[]).map(
                (source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => {
                      setSearchSource(source);
                      setBooks([]);
                      setSelectedBook(null);
                      setResult(null);
                      setNeedsManualText(false);
                      setMessage("");
                    }}
                    className={`rounded-lg border px-4 py-2 text-left text-sm ${
                      searchSource === source
                        ? "border-black bg-gray-100 font-semibold"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    {searchSourceLabels[source]}
                  </button>
                )
              )}
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            네이버 책 검색은 빠르고 긴 제목 검색에 강합니다. 도서관 정보나루는
            대출 수와 도서관 분류를 확인할 때 유용합니다.
          </p>

          <div className="mt-6 border-t pt-5">
            <h3 className="font-semibold">ISBN 직접 입력</h3>

            <p className="mt-1 text-sm text-gray-500">
              책 검색이 잘 안 되면 ISBN13 또는 ISBN10을 직접 입력할 수
              있습니다.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                value={isbnInput}
                onChange={(event) => setIsbnInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    selectBookByIsbn();
                  }
                }}
                placeholder="예: 9788934972464"
                className="flex-1 rounded-lg border px-4 py-2"
              />

              <button
                type="button"
                onClick={selectBookByIsbn}
                disabled={loading}
                className="rounded-lg bg-gray-800 px-5 py-2 text-white disabled:opacity-50"
              >
                ISBN으로 선택
              </button>
            </div>
          </div>
        </section>

        {books.length > 0 && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">2. 책 선택</h2>

            <div className="mt-4 grid gap-4">
              {books.map((book) => (
                <button
                  key={`${book.isbn13}-${book.bookname}`}
                  onClick={() => {
                    setSelectedBook(book);
                    setResult(null);
                    setNeedsManualText(false);
                    setMessage("");
                    setManualText("");
                  }}
                  className={`rounded-lg border p-4 text-left transition ${
                    selectedBook?.isbn13 === book.isbn13
                      ? "border-black bg-gray-100"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex gap-4">
                    {book.bookImageURL && (
                      <img
                        src={book.bookImageURL}
                        alt={book.bookname}
                        className="h-28 w-20 rounded object-cover"
                      />
                    )}

                    <div className="flex-1">
                      <div className="font-semibold">{book.bookname}</div>

                      <div className="mt-1 text-sm text-gray-600">
                        {book.authors} · {book.publisher} ·{" "}
                        {book.publication_year}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        ISBN13: {book.isbn13}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        검색 출처: {getBookSourceLabel(book.class_nm)}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        분류: {book.class_nm || "없음"}
                      </div>

                      {book.loan_count && (
                        <div className="mt-1 text-sm text-gray-500">
                          대출 수: {book.loan_count}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedBook && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">3. 분석 카테고리 선택</h2>

            <div className="mt-3 rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
              <div className="font-semibold">선택된 도서</div>
              <div className="mt-1">{selectedBook.bookname}</div>
              <div className="mt-1">ISBN13: {selectedBook.isbn13}</div>
              {selectedBook.authors && (
                <div className="mt-1">저자: {selectedBook.authors}</div>
              )}
              <div className="mt-1">
                선택 방식: {getBookSourceLabel(selectedBook.class_nm)}
              </div>
            </div>

            <select
              value={targetCategory}
              onChange={(event) => {
                setTargetCategory(event.target.value);
                setResult(null);
                setNeedsManualText(false);
                setMessage("");
              }}
              className="mt-4 w-full rounded-lg border px-4 py-2"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <button
              onClick={analyzeWithData4Library}
              disabled={loading}
              className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50"
            >
              정보나루 키워드로 분석
            </button>
          </section>
        )}

        {needsManualText && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">4. 수동 텍스트 입력</h2>

            <p className="mt-2 text-sm text-gray-600">
              교보문고, 알라딘, YES24 등의 책 소개, 목차, 출판사 서평, 서문
              일부를 입력해주세요. 책 전문이나 긴 본문 전체는 넣지 않는 것을
              권장합니다.
            </p>

            <textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="책 소개, 목차, 서문 일부를 붙여넣으세요."
              className="mt-4 h-48 w-full rounded-lg border px-4 py-3"
            />

            <button
              onClick={analyzeManualText}
              disabled={loading}
              className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-white disabled:opacity-50"
            >
              입력 텍스트로 분석
            </button>
          </section>
        )}

        {message && (
          <div className="mt-6 whitespace-pre-line rounded-lg bg-yellow-100 p-4 text-yellow-900">
            {message}
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-lg bg-gray-100 p-4">
            <div className="font-semibold">
              {loadingLabel || "처리 중"}
              {loadingDots}
            </div>

            <div className="mt-1 text-sm text-gray-500">
              화면이 멈춘 것이 아니라 서버에서 결과를 처리하는 중입니다.
            </div>
          </div>
        )}

        {result && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">분석 결과</h2>

            <div className="mt-4 rounded-lg bg-gray-100 p-5">
              <div className="text-sm text-gray-600">선택 카테고리</div>

              <div className="text-lg font-semibold">
                {result.targetCategory}
              </div>

              <div className="mt-4 text-sm text-gray-600">최종 점수</div>

              <div className="text-3xl font-bold">
                {result.score.score30} / 30점
              </div>

              <div className="mt-2 text-gray-600">
                적합도 비율: {result.score.percentage}%
              </div>

              <div className="mt-2 text-sm text-gray-500">
                유효 키워드 가중치 합: {result.score.totalValidWeight}
              </div>
            </div>

            <h3 className="mt-6 font-semibold">키워드 평가</h3>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">키워드</th>
                    <th className="p-2 text-left">가중치</th>
                    <th className="p-2 text-left">관련도</th>
                    <th className="p-2 text-left">배율</th>
                    <th className="p-2 text-left">판단 근거</th>
                  </tr>
                </thead>

                <tbody>
                  {result.evaluations.map((item, index) => (
                    <tr key={`${item.keyword}-${index}`} className="border-b">
                      <td className="p-2">{item.keyword}</td>
                      <td className="p-2">{item.weight}</td>
                      <td className="p-2">{item.relevance}</td>
                      <td className="p-2">{item.multiplier}</td>
                      <td className="p-2">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}