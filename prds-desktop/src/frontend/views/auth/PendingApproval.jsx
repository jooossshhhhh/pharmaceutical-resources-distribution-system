import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { logoutUser } from "@backend/services/auth/authService";

export default function PendingApproval() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleGoToLogin = async () => {
    setIsSigningOut(true);
    await logoutUser();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#E5EFF1] font-sans antialiased">
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1F4E5A] p-16 text-white lg:flex lg:w-1/2 flex-col justify-between">
        <div className="absolute inset-0 bg-linear-to-br from-[#1F4E5A] via-[#286575] to-[#163a43] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#34769B] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.25] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#4C9F80] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10">
          <div className="w-16 h-16 rounded-full bg-white p-2 flex items-center justify-center shadow-md mb-10 overflow-hidden">
            <img
              src="./src/assets/prds-logo-main.svg"
              alt="PRDS Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight leading-[1.15] mb-6">
            Pharmaceutical
            <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-gray-300">
              Resources
            </span>
            <br />
            Distribution
            <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#FEF08A] to-[#F5D461]">System</span>
          </h1>

          <p className="text-lg text-teal-100/80 max-w-md font-medium leading-relaxed">
            Account access is reviewed before users can enter the resource distribution workspace.
          </p>
        </div>

        <div className="relative z-10 text-sm text-teal-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#E5EFF1]/60">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 md:px-12">
          <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-[#1B2B30] mb-2">
                Pending Approval
              </h2>
              <p className="text-sm font-medium text-[#5B7077]">
                Your account request has been submitted.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-bold text-amber-900">
                Account awaiting administrator review
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                A PRDS administrator must approve your account before you can
                access the dashboard. You can return to the sign in page while
                waiting for approval.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoToLogin}
              disabled={isSigningOut}
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isSigningOut ? "Returning to Log In" : "Go to Log In"}
            </button>
          </div>
        </div>

        <div className="w-full border-t border-[#CFDDE0] py-6 px-12 flex justify-between items-center select-none bg-[#F9FBFB] relative">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-px bg-[#CFDDE0] hidden md:block"></div>

          <div className="w-10 h-10 filter grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-200">
            <img
              src="./src/assets/city-of-naga-seal.png"
              alt="City of Naga Seal"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="w-10 h-10 filter grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-200">
            <img
              src="./src/assets/naga-atong-garbo.png"
              alt="Naga Atong Garbo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
