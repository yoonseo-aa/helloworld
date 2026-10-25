package com.helloworld.global.exception;

import lombok.Getter;

/**
 * 비즈니스 예외. Service에서 이 예외를 던지면 GlobalExceptionHandler가 잡아
 * ApiResponse 에러 포맷으로 변환한다.
 * Controller/Service에서 try-catch로 에러 응답을 직접 만들지 않는다.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    // 기본 메시지를 상황에 맞게 덮어쓰고 싶을 때
    public BusinessException(ErrorCode errorCode, String customMessage) {
        super(customMessage);
        this.errorCode = errorCode;
    }
}
