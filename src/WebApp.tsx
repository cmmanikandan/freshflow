import App from './App';

export default function WebApp() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e9fff0_0%,_#f8f9fa_45%,_#f8f9fa_100%)] px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <App />
      </div>
    </div>
  );
}
