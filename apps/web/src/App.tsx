import { Hero } from "./components/Hero";
import { Features } from "./components/Features";
import { Compared } from "./components/Compared";
import { Recipe } from "./components/Recipe";
import { CodeShowcase } from "./components/CodeShowcase";
import { Footer } from "./components/Footer";

export function App() {
  return (
    <main className="relative">
      <Hero />
      <Features />
      <Compared />
      <Recipe />
      <CodeShowcase />
      <Footer />
    </main>
  );
}
