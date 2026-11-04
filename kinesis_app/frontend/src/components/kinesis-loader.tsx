type KinesisLoaderProps = {
  message: string;
  variant?: "page" | "inline";
};

export default function KinesisLoader({
  message,
  variant = "page",
}: KinesisLoaderProps) {
  const Container = variant === "page" ? "main" : "div";

  return (
    <Container
      className={`kinesis-loader kinesis-loader--${variant}`}
      role="status"
    >
      <span className="kinesis-loader-ring" aria-hidden="true">
        <span className="kinesis-loader-logo">
          <span className="kinesis-loader-tile kinesis-loader-tile--left" />
          <span className="kinesis-loader-tile kinesis-loader-tile--top" />
          <span className="kinesis-loader-tile kinesis-loader-tile--bottom" />
        </span>
      </span>
      <p>{message}</p>
    </Container>
  );
}
