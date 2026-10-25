package com.helloworld.global.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 전역 에러 코드. (HTTP status, code 문자열, 기본 메시지)
 * 접두어 규약: AUTH_, USER_, POST_, COMMENT_, SEARCH_, GITHUB_, COMMON_
 * 새 에러가 필요하면 여기에 추가한다. Controller/Service에서 문자열 코드를 직접 만들지 않는다.
 */
@Getter
public enum ErrorCode {

    /* 공통 */
    COMMON_INVALID_PARAM(HttpStatus.BAD_REQUEST, "COMMON_INVALID_PARAM", "잘못된 요청입니다."),
    COMMON_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_SERVER_ERROR", "서버 내부 오류가 발생했습니다."),

    /* 인증 */
    AUTH_UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "AUTH_001", "인증 정보가 유효하지 않거나 만료되었습니다."),
    AUTH_FORBIDDEN(HttpStatus.FORBIDDEN, "AUTH_002", "접근 권한이 없습니다."),
    AUTH_INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUTH_003", "이메일 또는 비밀번호가 일치하지 않습니다."),
    AUTH_INVALID_SOCIAL_CODE(HttpStatus.UNAUTHORIZED, "AUTH_004", "소셜 인가 코드가 만료되었거나 유효하지 않습니다."),
    AUTH_SOCIAL_SERVER_ERROR(HttpStatus.BAD_GATEWAY, "AUTH_005", "소셜 로그인 서버 통신에 실패했습니다. 잠시 후 다시 시도해주세요."),
    AUTH_SOCIAL_EMAIL_CONFLICT(HttpStatus.CONFLICT, "AUTH_006", "이미 가입된 이메일입니다."),
    AUTH_RESET_TOKEN_INVALID(HttpStatus.BAD_REQUEST, "AUTH_007", "유효하지 않거나 만료된 링크입니다."),

    /* 유저 */
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다."),
    USER_DUPLICATE_EMAIL(HttpStatus.CONFLICT, "USER_DUPLICATE_EMAIL", "이미 가입된 이메일입니다."),
    USER_DUPLICATE_NICKNAME(HttpStatus.CONFLICT, "USER_DUPLICATE_NICKNAME", "이미 사용 중인 닉네임입니다."),

    /* 게시물 */
    POST_NOT_FOUND(HttpStatus.NOT_FOUND, "POST_NOT_FOUND", "게시물을 찾을 수 없습니다."),
    POST_FORBIDDEN(HttpStatus.FORBIDDEN, "POST_FORBIDDEN", "접근 권한이 없는 게시물입니다."),

    /* 댓글 */
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMENT_NOT_FOUND", "존재하지 않는 댓글입니다."),
    COMMENT_FORBIDDEN(HttpStatus.FORBIDDEN, "COMMENT_FORBIDDEN", "본인이 작성한 댓글만 수정·삭제할 수 있습니다."),

    /* 팔로우 */
    CANNOT_FOLLOW_SELF(HttpStatus.BAD_REQUEST, "CANNOT_FOLLOW_SELF", "자기 자신은 팔로우할 수 없습니다."),

    /* 채팅 */
    CHAT_ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_ROOM_NOT_FOUND", "존재하지 않는 채팅방입니다."),
    CHAT_NOT_PARTICIPANT(HttpStatus.FORBIDDEN, "CHAT_NOT_PARTICIPANT", "채팅방 참여자가 아닙니다."),
    CHAT_CANNOT_INVITE_SELF(HttpStatus.BAD_REQUEST, "CHAT_CANNOT_INVITE_SELF", "자기 자신과는 대화할 수 없습니다."),
    CHAT_MESSAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "CHAT_MESSAGE_NOT_FOUND", "존재하지 않는 메시지입니다."),
    CHAT_CANNOT_DELETE_OTHERS(HttpStatus.FORBIDDEN, "CHAT_CANNOT_DELETE_OTHERS", "본인이 보낸 메시지만 삭제할 수 있습니다."),

    /* GitHub 연동 */
    // 프론트는 이 코드(GITHUB_NOT_CONNECTED)를 "오류"가 아니라 "아직 연동 안 함"으로 취급해
    // 잔디 영역을 조용히 숨긴다. 코드 문자열을 바꾸면 프로필 화면이 에러 토스트를 띄우게 된다.
    GITHUB_NOT_CONNECTED(HttpStatus.NOT_FOUND, "GITHUB_NOT_CONNECTED", "GitHub 계정이 연동되어 있지 않습니다."),
    GITHUB_ALREADY_CONNECTED(HttpStatus.CONFLICT, "GITHUB_ALREADY_CONNECTED", "이미 다른 회원과 연동된 GitHub 계정입니다."),
    GITHUB_INVALID_CODE(HttpStatus.UNAUTHORIZED, "GITHUB_INVALID_CODE", "GitHub 인가 코드가 만료되었거나 유효하지 않습니다."),
    GITHUB_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "GITHUB_TOKEN_EXPIRED", "GitHub 접근 권한이 만료되었습니다. 다시 연동해주세요."),
    GITHUB_USER_NOT_FOUND(HttpStatus.NOT_FOUND, "GITHUB_USER_NOT_FOUND", "GitHub 사용자를 찾을 수 없습니다."),
    GITHUB_SERVER_ERROR(HttpStatus.BAD_GATEWAY, "GITHUB_SERVER_ERROR", "GitHub 통신에 실패했습니다. 잠시 후 다시 시도해주세요."),

    /* 검색 */
    SEARCH_EMPTY_KEYWORD(HttpStatus.BAD_REQUEST, "SEARCH_EMPTY_KEYWORD", "검색어를 입력해주세요."),
    SEARCH_KEYWORD_TOO_SHORT(HttpStatus.BAD_REQUEST, "SEARCH_KEYWORD_TOO_SHORT", "두 글자 이상 입력해주세요."),
    SEARCH_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND, "SEARCH_HISTORY_NOT_FOUND", "검색 기록을 찾을 수 없습니다."),
    SEARCH_HISTORY_FORBIDDEN(HttpStatus.FORBIDDEN, "SEARCH_HISTORY_FORBIDDEN", "본인의 검색 기록만 삭제할 수 있습니다."),

    /* 파일 업로드 */
    FILE_EMPTY(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "파일이 비어 있습니다."),
    FILE_UNSUPPORTED_TYPE(HttpStatus.BAD_REQUEST, "FILE_UNSUPPORTED_TYPE", "이미지 파일만 업로드할 수 있습니다. (jpg, png, webp, gif)"),
    // 413이 아니라 400을 쓰는 이유: nginx가 크기 초과를 먼저 잡으면 413 HTML을 반환해
    // 봉투 규약을 못 지킨다. 앱에 도달한 요청은 형식 오류로 일관되게 처리한다.
    FILE_TOO_LARGE(HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", "파일 크기는 5MB를 넘을 수 없습니다."),
    FILE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_UPLOAD_FAILED", "파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }
}
