package com.mos.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class SpaFallbackController implements ErrorController {

    @RequestMapping("/error")
    public String handleError(HttpServletRequest request) {
        Integer statusCode = (Integer) request.getAttribute(
                "jakarta.servlet.RequestDispatcher.ERROR_STATUS_CODE");
        if (statusCode != null && statusCode == 404) {
            return "forward:/index.html";
        }
        return null;
    }
}
