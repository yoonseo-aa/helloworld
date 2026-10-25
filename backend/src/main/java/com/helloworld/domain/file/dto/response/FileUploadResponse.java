package com.helloworld.domain.file.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 업로드 결과. 프론트는 이 URL을 게시물·프로필 저장 요청에 그대로 담아 보낸다.
 *
 * <p>필드 이름이 {@code file_url}인 것은 프론트가 이미 그 이름으로 구현해 두었기 때문이다
 * ({@code frontend/src/api/files.ts}의 {@code data.data.file_url}). 바꾸면 프론트가 깨진다.
 *
 * <p>객체 키를 따로 내려주지 않는다 — 프론트가 쓸 일이 없고, 저장 위치 규칙(년/월/uuid)은
 * 서버 내부 사정이라 노출하면 나중에 바꾸기 어려워진다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class FileUploadResponse {

    private String fileUrl;

    public static FileUploadResponse of(String fileUrl) {
        return new FileUploadResponse(fileUrl);
    }
}
