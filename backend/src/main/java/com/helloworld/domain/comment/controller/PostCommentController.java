package com.helloworld.domain.comment.controller;

import com.helloworld.domain.comment.dto.request.CommentCreateRequest;
import com.helloworld.domain.comment.dto.response.CommentCreateResponse;
import com.helloworld.domain.comment.dto.response.CommentResponse;
import com.helloworld.domain.comment.service.CommentService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.common.PageResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 게시물에 종속된 댓글 API — 생성 / 목록 조회.
 *
 * [학습 포인트] URL을 왜 /api/posts/{postId}/comments 로 두는가?
 *  - "특정 게시물의 댓글"은 게시물 없이는 존재할 수 없는 종속 리소스다.
 *    이 관계를 경로에 드러내면 postId를 쿼리 파라미터나 바디로 받지 않아도 된다.
 *  - 반대로 이미 만들어진 댓글의 수정·삭제는 comment_id만으로 특정되므로
 *    /api/comments/{commentId} 로 분리했다(CommentController).
 */
@RestController
@RequestMapping("/api/posts/{postId}/comments")
@RequiredArgsConstructor
public class PostCommentController {

    private final CommentService commentService;

    /** 댓글 생성 (POST /api/posts/{postId}/comments) */
    @PostMapping
    public ResponseEntity<ApiResponse<CommentCreateResponse>> createComment(
            @LoginUserId Long userId,
            @PathVariable Long postId,
            @Valid @RequestBody CommentCreateRequest request) {
        CommentCreateResponse data = commentService.createComment(userId, postId, request);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("댓글이 등록되었습니다.", data));
    }

    /**
     * 댓글 목록 조회 (GET /api/posts/{postId}/comments?page=0&size=20)
     *
     * [학습 포인트] @RequestParam defaultValue
     *  - 클라이언트가 값을 안 보내도 동작하도록 기본값을 준다.
     *  - size는 상한을 두는 편이 안전하다(size=100000 요청으로 DB를 훑지 못하게).
     *    여기서는 Service가 아니라 컨트롤러에서 간단히 잘라낸다.
     *  - page도 상한을 둔다: Service의 offset = page * size 가 int라, page가 지나치게 크면
     *    곱셈이 int 범위를 넘어 음수로 뒤집히고(오버플로) SQL OFFSET 음수 → 500이 난다.
     *    safeSize(≤50) 기준으로 곱해도 int를 넘지 않도록 상한을 건다.
     */
    private static final int MAX_PAGE = Integer.MAX_VALUE / 50; // safeSize 상한(50)과 곱해도 int 안전

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<CommentResponse>>> getComments(
            @LoginUserId Long userId,
            @PathVariable Long postId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safePage = Math.min(Math.max(page, 0), MAX_PAGE);
        int safeSize = Math.min(Math.max(size, 1), 50);

        PageResponse<CommentResponse> data = commentService.getComments(userId, postId, safePage, safeSize);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}
