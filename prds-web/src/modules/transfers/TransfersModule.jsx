import { useAuth } from "../../context/useAuth";
import BhwTransfersModule from "./BhwTransfersModule";
import ChoTransfersModule from "./ChoTransfersModule";

export default function TransfersModule() {
  const { profile } = useAuth();

  if (profile?.role === "BHW") {
    return <BhwTransfersModule />;
  }

  return <ChoTransfersModule />;
}
