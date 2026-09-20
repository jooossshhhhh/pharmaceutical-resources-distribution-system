import BhwInventoryModule from "./BhwInventoryModule";
import ChoInventoryModule from "./ChoInventoryModule";
import { useAuth } from "../../context/useAuth";

export default function InventoryModule() {
  const { profile } = useAuth();

  if (profile?.role === "BHW") {
    return <BhwInventoryModule />;
  }

  return <ChoInventoryModule />;
}
