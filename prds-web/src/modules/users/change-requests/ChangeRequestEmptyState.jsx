import { SwapIcon } from "../components/UserManagementIcons";

export default function ChangeRequestEmptyState() {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <SwapIcon />
      </span>
      <h3 className="mt-3 text-sm font-black text-black">No facility changes match this view</h3>
      <p className="mt-1 max-w-md text-sm font-medium text-neutral-500">
        Facility reassignment requests from profile settings will appear here.
      </p>
    </div>
  );
}
