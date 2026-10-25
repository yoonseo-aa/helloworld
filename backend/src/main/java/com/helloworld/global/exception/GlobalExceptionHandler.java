package com.helloworld.global.exception;

import com.helloworld.global.common.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

/**
 * 모든 예외를 잡아 ApiResponse 에러 포맷으로 변환하는 전역 핸들러.
 * 새로운 예외 유형이 필요하면 여기에 @ExceptionHandler를 추가한다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /* 비즈니스 예외 */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        ErrorCode ec = e.getErrorCode();
        log.warn("BusinessException: {} - {}", ec.getCode(), e.getMessage());
        return ResponseEntity
                .status(ec.getStatus())
                .body(ApiResponse.error(ec.getCode(), e.getMessage()));
    }

    /* @Valid 검증 실패 → 400 FAIL */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        FieldError fieldError = e.getBindingResult().getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "잘못된 요청입니다.";
        return ResponseEntity
                .status(ErrorCode.COMMON_INVALID_PARAM.getStatus())
                .body(ApiResponse.fail(ErrorCode.COMMON_INVALID_PARAM.getCode(), message));
    }

    /* 쿼리/경로 파라미터 타입 변환 실패(예: ?cursor=abc, ?limit=abc, /{searchId}에 숫자 아님 등 Long 자리에 숫자 아님) → 400 */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.warn("파라미터 타입 불일치: {}={}", e.getName(), e.getValue());
        String message = "요청 파라미터 '" + e.getName() + "'의 형식이 올바르지 않습니다.";
        return ResponseEntity
                .status(ErrorCode.COMMON_INVALID_PARAM.getStatus())
                .body(ApiResponse.fail(ErrorCode.COMMON_INVALID_PARAM.getCode(), message));
    }

    /*
     * 업로드 크기 초과 → 400 FILE_TOO_LARGE
     *
     * 이 예외는 컨트롤러에 들어오기 전에 스프링이 던진다(multipart 파싱 단계).
     * 그래서 FileService의 크기 검사로는 잡히지 않고, 이 핸들러가 없으면 아래
     * handleUnexpected로 떨어져 "서버 내부 오류"(500)가 나간다 — 사용자는 자기 파일이
     * 큰 것인지 서버가 고장난 것인지 알 수 없다.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleUploadSizeExceeded(MaxUploadSizeExceededException e) {
        ErrorCode ec = ErrorCode.FILE_TOO_LARGE;
        return ResponseEntity.status(ec.getStatus()).body(ApiResponse.fail(ec.getCode(), ec.getMessage()));
    }

    /*
     * multipart 요청 자체를 파싱하지 못한 경우 → 400 COMMON_INVALID_PARAM
     *
     * 크기 초과와 마찬가지로 컨트롤러 진입 전에 던져진다. 핸들러가 없으면 아래
     * handleUnexpected로 떨어져 500 "서버 내부 오류"가 나가는데, 실제로는 클라이언트가
     * 보낸 요청이 깨진 경우다. 잘못된 요청을 서버 잘못으로 보고하면
     *  - 사용자는 기다렸다 다시 시도하면 될 거라 오해하고
     *  - 서버 로그에 ERROR가 쌓여 진짜 장애를 가린다.
     *
     * 예: 파일명에 NUL 바이트가 섞인 요청(photo.png\0.html)을 톰캣이 거부한다 — 실측으로 확인.
     * MaxUploadSizeExceededException은 이 예외의 하위 타입이지만, 스프링이 더 구체적인
     * 핸들러를 고르므로 크기 초과는 위쪽 핸들러가 그대로 처리한다.
     */
    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMultipart(MultipartException e) {
        log.warn("multipart 파싱 실패: {}", e.getMessage());
        ErrorCode ec = ErrorCode.COMMON_INVALID_PARAM;
        return ResponseEntity.status(ec.getStatus())
                .body(ApiResponse.fail(ec.getCode(), "파일 업로드 요청 형식이 올바르지 않습니다."));
    }

    /**
     * 매핑된 컨트롤러가 없는 경로 → 404.
     *
     * <p>이 핸들러가 없으면 아래 {@code Exception} 핸들러가 받아서 <b>500 + 스택트레이스</b>가 된다.
     * 실제로 그랬다 — 프론트가 아직 구현되지 않은 API를 부를 때마다 "서버 내부 오류"가 뜨고
     * 로그에 수백 줄짜리 스택이 쌓여, 진짜 오류를 찾을 때 그것들에 묻혔다.
     *
     * <p>없는 경로는 서버가 고장난 게 아니라 <b>클라이언트가 잘못 부른 것</b>이므로 404가 맞다.
     * 로그도 한 줄만 남긴다.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException e) {
        log.warn("매핑된 API가 없습니다: {} {}", e.getHttpMethod(), e.getResourcePath());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.fail("COMMON_NOT_FOUND", "요청한 API를 찾을 수 없습니다."));
    }

    /* 그 외 예상치 못한 예외 → 500 ERROR */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception e) {
        log.error("Unexpected exception", e);
        ErrorCode ec = ErrorCode.COMMON_SERVER_ERROR;
        return ResponseEntity
                .status(ec.getStatus())
                .body(ApiResponse.error(ec.getCode(), ec.getMessage()));
    }
}
