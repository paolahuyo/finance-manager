export default function Header(): JSX.Element {
  return (
    <header className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold">💰 Finance Manager</h1>
        <p className="text-blue-100 mt-2">Controla tus ingresos, gastos y deudas en pesos colombianos</p>
      </div>
    </header>
  );
}
