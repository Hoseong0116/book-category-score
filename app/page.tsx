"use client";

import { useState } from "react";

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
  "사회/정치/법률",
  "철학/역사/인류",
  "자연과학/기술/미래",
  "심리/교육/에세이",
  "예술/문화",
  "문학",
];

function getErrorMessage(data: any, fallback: string) {
  if (data?.detail) {
    return `${data.error || fallback}\n${data.detail}`;
  }

  if (data?.error) {
    return data.error;
  }

  return fallback;
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  const [books, setBooks] = useState<BookDoc[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookDoc | null>(null);

  const [targetCategory, setTargetCategory] = useState("자연과학/기술/미래");
  const [manualText, setManualText] = useState("");
  const [needsManualText, setNeedsManualText] = useState(false);

  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function searchBooks() {
    if (!title.trim() && !author.trim()) {
      setMessage("책 제목 또는 저자를 입력해주세요.");
      return;
    }

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

      const response = await fetch(`/api/search-book?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(getErrorMessage(data, "책 검색 중 오류가 발생했습니다."));
        return;
      }

      const docs: BookDoc[] =
        data?.response?.docs?.map((item: SearchBookItem) => item.doc) || [];

      setBooks(docs);

      if (docs.length === 0) {
        setMessage(
          "검색 결과가 없습니다. 책 제목을 줄이거나 저자명을 빼고 다시 검색해보세요."
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("책 검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeWithData4Library() {
    if (!selectedBook) {
      setMessage("분석할 책을 선택해주세요.");
      return;
    }

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
          책 제목과 저자를 기준으로 도서를 검색하고, 선택한 카테고리에 대한
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
              placeholder="책 제목 예: 넥서스"
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
              placeholder="저자 예: 유발 하라리"
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

          <p className="mt-3 text-sm text-gray-500">
            책 제목과 저자를 따로 검색합니다. 출판사명이 검색어와 같아도 책
            제목/저자 조건에 맞지 않으면 제외됩니다.
          </p>
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
                  <div className="font-semibold">{book.bookname}</div>

                  <div className="mt-1 text-sm text-gray-600">
                    {book.authors} · {book.publisher} · {book.publication_year}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    ISBN13: {book.isbn13}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    분류: {book.class_nm || "없음"}
                  </div>

                  {book.loan_count && (
                    <div className="mt-1 text-sm text-gray-500">
                      대출 수: {book.loan_count}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedBook && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">3. 분석 카테고리 선택</h2>

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
            분석 중입니다...
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