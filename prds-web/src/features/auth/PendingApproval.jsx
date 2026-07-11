import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { logoutUser } from "./AuthService";

export default function PendingApproval() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleGoToLogin = async () => {
    setIsSigningOut(true);
    await logoutUser();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex font-sans antialiased bg-gray-50">
      <div className="hidden lg:flex lg:w-1/2 bg-[#1d3f8c] relative text-white p-16 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-[#1d3f8c] via-[#254fa8] to-[#0e1f47] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#dc8939] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.15] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#b53e53] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
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
            <span className="text-[#dc8939]">System</span>
          </h1>

          <p className="text-lg text-blue-100/80 max-w-md font-medium leading-relaxed">
            Account access is reviewed before users can enter the resource distribution workspace.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white min-h-screen relative">
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-12">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Pending Approval
              </h2>
              <p className="text-sm font-medium text-slate-500">
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
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#008000] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-green-800/10 transition-all duration-150 hover:bg-[#006600] hover:shadow-lg hover:shadow-green-800/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSigningOut ? "Returning to Sign In" : "Go to Sign In"}
            </button>
          </div>
        </div>

        <div className="w-full border-t border-gray-100 py-6 px-12 flex justify-between items-center select-none bg-white relative">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-px bg-gray-200 hidden md:block"></div>

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
