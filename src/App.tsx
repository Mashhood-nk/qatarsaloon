import { Link, Route, Routes } from "react-router";
import { ShopHome } from "./pages/shop/ShopHome";
import { Book } from "./pages/shop/Book";
import { BookingPage } from "./pages/shop/BookingPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { Login } from "./pages/admin/Login";
import { Today } from "./pages/admin/Today";
import { BookingDetail } from "./pages/admin/BookingDetail";
import { WalkIn } from "./pages/admin/WalkIn";
import { Customers } from "./pages/admin/Customers";
import { CustomerDetail } from "./pages/admin/CustomerDetail";
import { Services } from "./pages/admin/Services";
import { Hours } from "./pages/admin/Hours";
import { ShopSettings } from "./pages/admin/ShopSettings";
import { Team } from "./pages/admin/Team";
import { Platform } from "./pages/platform/Platform";

function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6">
      <h1 className="display text-5xl leading-tight">Barber bookings</h1>
      <p className="text-ink-soft">Online booking for barbershops. Customers book from a link; barbers confirm on WhatsApp.</p>
      <Link to="/admin" className="btn-outline self-start">
        Barber login
      </Link>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display text-4xl">Page not found</h1>
      <Link to="/" className="underline">
        Go home
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Today />} />
        <Route path="walkin" element={<WalkIn />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="services" element={<Services />} />
        <Route path="hours" element={<Hours />} />
        <Route path="shop" element={<ShopSettings />} />
        <Route path="team" element={<Team />} />
      </Route>
      <Route path="/platform" element={<Platform />} />
      <Route path="/b/:token" element={<BookingPage />} />
      <Route path="/:slug" element={<ShopHome />} />
      <Route path="/:slug/book" element={<Book />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
