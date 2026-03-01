import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import SEO from "@/components/SEO";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SEO
        title="Page Not Found"
        description="The page you are looking for could not be found. Return to Lead Velocity's homepage."
      />
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold gradient-text">404</h1>
        <p className="text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="inline-block text-primary underline hover:text-primary/80 transition-colors">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
