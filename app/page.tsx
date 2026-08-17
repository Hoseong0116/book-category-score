
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-900">
      <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-2xl">
          ⚠️
        </div>

        <h1 className="text-2xl font-bold">서비스 점검 중입니다</h1>

        <p className="mt-4 text-gray-600">
          현재 서비스 안정화를 위해 점검을 진행하고 있습니다.
        </p>

        <p className="mt-2 text-gray-600">
          이용에 불편을 드려 죄송합니다.
        </p>

        <div className="mt-6 rounded-lg bg-gray-100 p-4 text-sm text-gray-700">
          문제가 지속될 경우 관리자에게 문의해주세요.
        </div>
      </section>
    </main>
  );
}