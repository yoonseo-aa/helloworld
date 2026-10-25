package com.helloworld.domain.like.mapper;

import com.helloworld.domain.like.dto.response.LikedPostResponse;
import com.helloworld.domain.like.dto.response.PostLikerResponse;
import com.helloworld.domain.like.entity.PostLike;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * post_likes DB 접근 (MyBatis). SQL은 resources/mapper/like/PostLikeMapper.xml 에 작성.
 * 정본은 Redis라서, 여기 값은 SQS Listener가 비동기로 반영하는 백업/조회용이다.
 */
@Mapper
public interface PostLikeMapper {

    /** 좋아요 등록 (정본=Redis가 이미 처리한 뒤 비동기로 RDB에 반영). 이미 있으면 무시 */
    int insertLikeIfAbsent(PostLike postLike);

    /** 좋아요 취소 (hard delete) */
    int deleteLike(@Param("postId") Long postId, @Param("userId") Long userId);

    /**
     * 게시물에 좋아요 누른 사용자 목록 (커서 기반, 최신순).
     * limit은 CursorResponse의 "size+1 조회" 패턴에 맞춰 Service가 size+1을 넘긴다.
     */
    List<PostLikerResponse> selectLikersByPost(@Param("postId") Long postId,
                                                @Param("cursor") Long cursor,
                                                @Param("limit") int limit);

    /**
     * 특정 사용자가 좋아요 누른 게시물 목록 (커서 기반, 최신순 = 좋아요 누른 순).
     */
    List<LikedPostResponse> selectLikedPostsByUser(@Param("userId") Long userId,
                                                    @Param("cursor") Long cursor,
                                                    @Param("limit") int limit);
}
