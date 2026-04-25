import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import AgentShowcase from "@/components/landing/AgentShowcase";
import StatsBar from "@/components/landing/StatsBar";
import Pricing from "@/components/landing/Pricing";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

const Index = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Navbar />
    <Hero />
    <Features />
    <HowItWorks />
    <AgentShowcase />
    <StatsBar />
    <Pricing />
    <FinalCTA />
    <Footer />
  </div>
);

export default Index;
