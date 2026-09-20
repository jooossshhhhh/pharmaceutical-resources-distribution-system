import { useAuth } from "../../context/useAuth";
import BhwDispensingModule from "./BhwDispensingModule";
import ChoDispensingModule from "./ChoDispensingModule";

export default function DispensingModule() {
  const { profile } = useAuth();

  if (profile?.role === "BHW") {
    return <BhwDispensingModule />;
  }

  return <ChoDispensingModule />;
}
