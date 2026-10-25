package com.helloworld.global.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;

/**
 * 전 API 공통 응답 래퍼.
 * 성공: { "status": "SUCCESS", "message": ..., "data": ... }
 * 에러: { "status": "ERROR", "code": ..., "message": ... }
 *
 * 공통 API 규약서 기준. Controller는 반드시 이 래퍼로 감싸서 반환한다.
 */
@Getter
@JsonInclude(JsonInclude.Include.NON_NULL) // null 필드는 응답에서 제외 (성공 시 code, 에러 시 data 숨김)
public class ApiResponse<T> {

    private final String status;   // SUCCESS / FAIL / ERROR
    private final String code;     // 에러 코드 (성공 시 null)
    private final String message;
    private final T data;

    private ApiResponse(String status, String code, String message, T data) {
        this.status = status;
        this.code = code;
        this.message = message;
        this.data = data;
    }

    /* ===== 성공 ===== */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>("SUCCESS", null, "요청에 성공하였습니다.", data);
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>("SUCCESS", null, message, data);
    }

    public static ApiResponse<Void> success(String message) {
        return new ApiResponse<>("SUCCESS", null, message, null);
    }

    /* ===== 실패(예상된 실패: 유효성/중복 등) ===== */
    public static <T> ApiResponse<T> fail(String code, String message) {
        return new ApiResponse<>("FAIL", code, message, null);
    }

    /* ===== 에러(예외/서버 오류) ===== */
    public static <T> ApiResponse<T> error(String code, String message) {
        return new ApiResponse<>("ERROR", code, message, null);
    }
}
