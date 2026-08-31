// src/pages/PrivacyPage.tsx — Warm Ink
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-stone-400">
      <h1 className="text-2xl font-bold text-stone-100 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Privacy Policy</h1>
      <p className="text-sm leading-relaxed">We store resumes securely and only use data to provide ATS scoring and job matching. Contact support for data deletion requests.</p>
      <a href="/" className="text-amber-300 hover:text-amber-200 text-sm mt-4 inline-block">← Back to home</a>
    </div>
  );
}
