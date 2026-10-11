package com.musicholo.controller;

import com.musicholo.common.Result;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Same-origin proxy for public platform catalog endpoints that do not expose browser CORS. */
@RestController
@RequestMapping("/catalog")
public class OnlineCatalogController {
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @GetMapping(value = "/wy/charts", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> charts() {
        return fetch("https://music.163.com/api/toplist/detail");
    }

    @GetMapping(value = "/wy/charts/{chartId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> chartTracks(@PathVariable String chartId) {
        if (!chartId.matches("[0-9]{1,20}")) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid chart id\"}");
        }
        return fetch("https://music.163.com/api/playlist/detail?id=" + chartId);
    }

    private ResponseEntity<String> fetch(String target) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(target))
                    .timeout(Duration.ofSeconds(15))
                    .header("Accept", "application/json")
                    .header("User-Agent", "Music-Holo-Catalog/1.0")
                    .GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            MediaType contentType = MediaType.APPLICATION_JSON;
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return ResponseEntity.status(response.statusCode()).contentType(contentType)
                        .body("{\"error\":\"upstream status " + response.statusCode() + "\"}");
            }
            return ResponseEntity.ok().contentType(contentType).body(response.body());
        } catch (Exception error) {
            return ResponseEntity.status(502).contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"online chart upstream unavailable\"}");
        }
    }
}
