import Board from "@/components/Board";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <Board />
    </ErrorBoundary>
  );
}
