import { useAuth } from "../../context/useAuth";
import BhwPatientsModule from "./BhwPatientsModule";
import ChoPatientsModule from "./ChoPatientsModule";

export default function PatientsModule() {
  const { profile } = useAuth();

  if (profile?.role === "BHW") {
    return <BhwPatientsModule />;
  }

  return <ChoPatientsModule />;
}