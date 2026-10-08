# Build the Spring Boot application with the same Java major version used by CI.
FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN mvn --batch-mode --no-transfer-progress -DskipTests package

# Keep the runtime image smaller and run the app as a non-root user.
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/upload \
    && chown -R 10001:10001 /app
COPY --from=build --chown=10001:10001 /workspace/target/music-holo-server-1.0.0.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=8 \
  CMD curl --fail --silent http://127.0.0.1:8080/system/theme >/dev/null || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
