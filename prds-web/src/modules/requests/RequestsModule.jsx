import BhwRequestsModule from "./BhwRequestsModule";
import ChoRequestsModule from "./ChoRequestsModule";
import { useAuth } from "../../context/useAuth";

export default function RequestsModule() {
  const { profile } = useAuth();

  if (profile?.role === "BHW") {
    return <BhwRequestsModule />;
  }

  return <ChoRequestsModule />;
}
